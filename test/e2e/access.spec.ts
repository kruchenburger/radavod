import type { BrowserContext, Page } from "@playwright/test";
import { SETUP_CODE } from "../../playwright.config.ts";
import { expect, expectAccessible, expectNoSideScroll, test } from "./page.ts";

/** A phone or computer with a passkey store of its own, as Chromium can pretend to be one. */
async function withAuthenticator(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return page;
}

test.describe("the pages of signing in at 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: "ru" });

  for (const [path, heading] of [
    ["/setup", "Новая семья"],
    ["/sign-in", "Вход"],
  ] as const) {
    test(`${path} reads and fits`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expectAccessible(page);
      await expectNoSideScroll(page);
    });
  }

  test("a link cut off says so", async ({ page }) => {
    await page.goto("/join");
    await expect(page.getByRole("alert")).toHaveText(
      "Ссылка открылась не полностью. Скопируйте её из сообщения целиком и откройте снова.",
    );
    await expectAccessible(page);
  });

  test("a member's page sends whoever is signed out to sign in", async ({ page }) => {
    await page.goto("/family");
    await expect(page).toHaveURL(/\/sign-in$/u);
  });
});

test.describe("a family from its first keeper", () => {
  // The family is one per Worker: it is set up once, and a retry would find it set up.
  test.describe.configure({ retries: 0 });
  // Once, on the computer: the phone project shares the same Worker, already set up by then.
  test.skip(({ isMobile }) => isMobile);
  test.use({ locale: "en" });

  test("sets up, invites, lets a relative in, signs out and back in", async ({
    browser,
    baseURL,
    context,
  }) => {
    // The keeper is the browser of the test itself, whose requests the page checks.
    const keeper = await withAuthenticator(context);
    await keeper.goto("/setup");
    await keeper.getByRole("textbox", { name: /Setup code/u }).fill(SETUP_CODE);
    await keeper.getByRole("textbox", { name: /Family name/u }).fill("Oaks");
    await keeper.getByRole("textbox", { name: /Your name/u }).fill("Ann");
    await keeper.getByRole("button", { name: "Create a passkey" }).click();
    await expect(keeper).toHaveURL(/\/family$/u);
    await expect(keeper.getByRole("link", { name: "Oaks" })).toBeVisible();
    await expectAccessible(keeper);

    await keeper.getByRole("combobox", { name: "Role" }).last().selectOption("editor");
    await keeper.getByRole("button", { name: "Create an invitation" }).click();
    const link = await keeper.getByRole("textbox", { name: "Link" }).inputValue();
    expect(link).toMatch(/\/join#[A-Za-z0-9_-]{43}$/u);

    const relativeContext = await browser.newContext({ baseURL: baseURL ?? "", locale: "en" });
    const relative = await withAuthenticator(relativeContext);
    await relative.goto(link);
    await expect(
      relative.getByRole("heading", { level: 1, name: "An invitation to the Oaks family" }),
    ).toBeVisible();
    await expect(relative.getByText("You're invited as an editor.")).toBeVisible();
    await expectAccessible(relative);
    await relative.getByRole("textbox", { name: /Your name/u }).fill("Eve");
    await relative.getByRole("button", { name: "Create a passkey" }).click();
    await expect(relative).toHaveURL(/\/family$/u);
    await expect(relative.getByText("Eve")).toBeVisible();

    // The link is spent: another browser gets the reason and the way out.
    const late = await (
      await browser.newContext({ baseURL: baseURL ?? "", locale: "en" })
    ).newPage();
    await late.goto(link);
    await expect(late.getByRole("alert")).toHaveText(
      "This link has been used already. Ask a keeper for a new one.",
    );

    await keeper.reload();
    await expect(keeper.getByText(/Eve, signed in/u)).toBeVisible();

    await relative.getByRole("link", { name: "Account" }).click();
    await expectAccessible(relative);
    await relative.getByRole("button", { name: "Sign out" }).click();
    await expect(relative).toHaveURL(/\/$/u);
    await relative.goto("/sign-in");
    await relative.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(relative).toHaveURL(/\/family$/u);

    await relativeContext.close();
  });
});
