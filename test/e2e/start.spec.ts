import { expect, expectAccessible, expectNoSideScroll, test, theme } from "./page.ts";

const languages = [
  {
    locale: "ru",
    about: "Приватный сайт с древом вашей семьи.",
    version: "Версия dev",
    light: "Светлая",
    dark: "Тёмная",
    down: "Древо не открывается: хранилище не отвечает. Напишите хранителю.",
    broken: "Сервер ответил с ошибкой. Обновите страницу или напишите хранителю.",
    unreachable: "Сервер не ответил. Проверьте интернет и обновите страницу.",
  },
  {
    locale: "en",
    about: "A private website for your family tree.",
    version: "Version dev",
    light: "Light",
    dark: "Dark",
    down: "The tree won't open: its storage isn't responding. Tell a keeper.",
    broken: "The server answered with an error. Reload the page or tell a keeper.",
    unreachable: "The server didn't respond. Check your connection and reload the page.",
  },
] as const;

for (const { locale, about, version, light, dark, down, broken, unreachable } of languages) {
  test.describe(locale, () => {
    test.use({ locale });

    for (const [scheme, option] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      test(`the start page in the ${scheme} theme`, async ({ page }) => {
        await page.goto("/");
        await page.getByText(option, { exact: true }).click();
        expect(await theme(page)).toBe(scheme);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1, name: "Radavod" })).toBeVisible();
        await expect(page.getByText(about)).toBeVisible();
        await expect(page.getByRole("status")).toHaveText(version);
        await expectAccessible(page);
      });

      test(`a server that fails in the ${scheme} theme`, async ({ page }) => {
        await page.route("/health", (route) =>
          route.fulfill({
            status: 503,
            json: { status: "error", version: "dev", tree: "error", access: "ok" },
          }),
        );
        await page.goto("/");
        await page.getByText(option, { exact: true }).click();
        await expect(page.getByRole("status")).toHaveText(down);
        await expect(page.getByText(version)).toBeVisible();
        await expectAccessible(page);
      });
    }

    test("a server that answers with something else", async ({ page }) => {
      await page.route("/health", (route) => route.fulfill({ status: 502, body: "<html>" }));
      await page.goto("/");
      await expect(page.getByRole("status")).toHaveText(broken);
    });

    test("a server that does not answer", async ({ page }) => {
      await page.route("/health", (route) => route.abort());
      await page.goto("/");
      await expect(page.getByRole("status")).toHaveText(unreachable);
    });

    test.describe("at 360 px", () => {
      test.use({ viewport: { width: 360, height: 740 } });

      test("has no horizontal scroll", async ({ page }) => {
        await page.goto("/");
        await expect(page.getByRole("status")).toHaveText(version);
        await expectNoSideScroll(page);
      });

      test("has no horizontal scroll when the server fails", async ({ page }) => {
        await page.route("/health", (route) => route.abort());
        await page.goto("/");
        await expect(page.getByRole("status")).toHaveText(unreachable);
        await expectNoSideScroll(page);
      });
    });
  });
}

test("the language and the theme survive a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await theme(page)).toBe("light");

  await page.getByText("Русский", { exact: true }).click();
  await page.getByText("Тёмная", { exact: true }).click();
  await page.reload();
  await expect(page.getByText("Приватный сайт с древом вашей семьи.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  expect(await theme(page)).toBe("dark");
  await expect(page.getByRole("radio", { name: "Русский" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();

  await page.getByText("English", { exact: true }).click();
  await page.getByText("Light", { exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await theme(page)).toBe("light");
});

test.describe("a dark browser", () => {
  test.use({ colorScheme: "dark" });

  test("gets the dark theme until the visitor picks one", async ({ page }) => {
    await page.goto("/");
    expect(await theme(page)).toBe("dark");
    await page.getByText("Light", { exact: true }).click();
    await page.reload();
    expect(await theme(page)).toBe("light");
  });
});

test("has an icon, under the old address too", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  const icon = await request.get("/favicon.ico");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
});

test("the Worker answers behind the page", async ({ page, request }) => {
  await page.goto("/");
  const health = await request.get("/health");
  expect([health.status(), await health.json()]).toEqual([
    200,
    { status: "ok", version: "dev", tree: "ok", access: "ok" },
  ]);
  expect((await request.get("/api/people")).status()).toBe(401);
});
