import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import type { TreeSample } from "../../src/shared/tree.ts";
import { expect, expectAccessible, expectNoSideScroll, test, theme } from "./page.ts";

test.use({ isQuiet: true });

const sample = JSON.parse(readFileSync("dist/client/sample/tree.json", "utf8")) as TreeSample;
const { start, snapshot } = sample;
const nameOf = (id: string): string => {
  const form = snapshot.people.find((person) => person.id === id)?.name;
  return `${form?.given} ${form?.surname}`;
};
const father = snapshot.people.find(({ id }) => id === start)?.parents[0]?.parent ?? "";
/** Three unions, so one of them is open; see examples/hard-cases.ts. */
const manyUnions = "p28";

const screens = [
  ["around a person", "/sample"],
  ["several unions", `/sample/tree/${manyUnions}?siblings=open`],
  ["a repeated ancestor", "/sample/tree/p162"],
  ["all branches from far", "/sample/branches"],
  ["all branches closer", `/sample/branches?level=closer&person=${start}`],
  ["all branches near", `/sample/branches?level=near&person=${start}`],
  ["a person", `/sample/person/${manyUnions}`],
  ["the list", `/sample/list/${start}`],
] as const;

/** Everything has come that will come. */
async function ready(page: Page): Promise<void> {
  await expect(page.locator("[data-screen]")).toBeVisible();
  await expect(page.locator("[data-screen] [role=status]").filter({ hasText: /^.+/ })).toHaveCount(
    0,
  );
  await page.evaluate("document.fonts.ready");
}

const map = (page: Page): Locator => page.locator("[data-level]");
const level = (page: Page) => map(page).getAttribute("data-level");
const centre = (page: Page): Locator => page.locator("[data-focus]");
const searchOf = (page: Page) => new URL(page.url()).searchParams;

for (const locale of ["ru", "en"] as const) {
  test.describe(locale, () => {
    test.use({ locale });
    const mark = { ru: "Пример", en: "Example" }[locale];
    const leave = { ru: "Закрыть пример", en: "Close example" }[locale];

    test("opens from the start page and is left again", async ({ page }) => {
      await page.goto("/");
      await page
        .getByRole("link", { name: { ru: "Открыть пример", en: "Open the example" }[locale] })
        .click();
      await expect(page).toHaveURL("/sample");
      await expect(page.getByText(mark, { exact: true })).toBeVisible();
      await expect(centre(page)).toBeVisible();
      await page.getByRole("link", { name: leave }).click();
      await expect(page).toHaveURL("/");
    });

    for (const scheme of ["light", "dark"] as const) {
      for (const [name, path] of screens) {
        test(`${name} in the ${scheme} theme`, async ({ page }) => {
          await page.addInitScript((value) => localStorage.setItem("radavod.theme", value), scheme);
          await page.goto(path);
          await ready(page);
          expect(await theme(page)).toBe(scheme);
          await expect(page.getByText(mark, { exact: true }).filter({ visible: true })).toHaveCount(
            1,
          );
          await expectAccessible(page);
        });
      }
    }

    test.describe("at 360 px", () => {
      test.use({ viewport: { width: 360, height: 740 } });
      for (const [name, path] of screens) {
        test(`${name} has no horizontal scroll`, async ({ page }) => {
          await page.goto(path);
          await ready(page);
          await expectNoSideScroll(page);
        });
      }
    });

    test.describe("at 1280 px and 400% text", () => {
      test.use({ viewport: { width: 1280, height: 900 } });
      for (const [name, path] of screens) {
        test(`${name} has no horizontal scroll`, async ({ page }) => {
          const session = await page.context().newCDPSession(page);
          await session.send("Page.setFontSizes", { fontSizes: { standard: 64, fixed: 52 } });
          await page.goto(path);
          await ready(page);
          const size = await page.evaluate("getComputedStyle(document.documentElement).fontSize");
          expect(size).toBe("64px");
          await expectNoSideScroll(page);
        });
      }
    });
  });
}

test("has no side scroll between the phone and the spread", async ({ page }) => {
  for (const width of [720, 800, 1000, 1399, 1400]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/sample", `/sample/tree/${manyUnions}?half=descendants`]) {
      await page.goto(path);
      await ready(page);
      await expectNoSideScroll(page);
    }
  }
});

test("the Worker serves the screens and no other page", async ({ page, request }) => {
  await page.goto("/");
  for (const [, path] of screens) {
    const answer = await request.get(path);
    expect([answer.status(), answer.headers()["content-type"]], path).toEqual([
      200,
      expect.stringContaining("text/html"),
    ]);
  }
  for (const path of [
    "/sample/people",
    "/sample/",
    "/sample/tree",
    "/people",
    "/sample/tree/a/b",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  expect((await request.get("/api/people")).status()).toBe(401);
  expect(await (await request.get("/config")).json()).toEqual({ sample: true });
});

test("is unknown where the installation does not allow it", async ({ page }) => {
  await page.route("/config", (route) => route.fulfill({ json: { sample: false } }));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Version dev");
  await expect(page.getByRole("link", { name: "Open the example" })).toHaveCount(0);
  await page.goto("/sample");
  await expect(page.getByText("There's no such page")).toBeVisible();
});

test.describe("around a person", () => {
  test("a press moves the names to their places, and a new press interrupts", async ({ page }) => {
    await page.goto("/sample");
    await ready(page);
    const before = await page.locator(`[data-key="p:${start}"]`).boundingBox();
    await page.locator(`[data-press="p:${father}"]`).click();
    await expect(page).toHaveURL(`/sample/tree/${father}`);
    const running = () =>
      page.evaluate(
        "document.getAnimations().filter((one) => one.effect.getTiming().duration === 240).length",
      );
    expect(await running()).toBeGreaterThan(0);
    // In the middle of the way it is neither here nor there, and a press takes it from where it is.
    await page.locator(`[data-press="p:${start}"]`).first().dispatchEvent("click");
    await expect(page).toHaveURL(`/sample/tree/${start}`);
    await expect.poll(running).toBe(0);
    const after = await page.locator(`[data-key="p:${start}"]`).boundingBox();
    expect(after).toEqual(before);
  });

  test("nothing moves where motion is not wanted", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sample");
    await ready(page);
    await page.locator(`[data-press="p:${father}"]`).click();
    expect(await page.evaluate("document.getAnimations().length")).toBe(0);
  });

  test("opens with the chosen person in the middle", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 500 });
    await page.goto(`/sample/tree/${father}`);
    await ready(page);
    const box = await centre(page).boundingBox();
    expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - 250)).toBeLessThan(60);
  });

  test("back and forward work, and a link opens the same view", async ({ page, context }) => {
    await page.goto("/sample");
    await ready(page);
    await page.locator(`[data-press="p:${father}"]`).click();
    await page.getByRole("link", { name: /^Siblings/ }).click();
    const { href } = new URL(page.url());
    expect(href).toContain("siblings=open");
    const texts = () => centre(page).evaluate((card) => card.textContent);
    const seen = await texts();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL("/sample");
    await expect(centre(page)).toHaveAttribute("data-key", `p:${start}`);
    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(href);
    const other = await context.newPage();
    await other.goto(href);
    await ready(other);
    expect(await centre(other).evaluate((card) => card.textContent)).toBe(seen);
  });

  test("is walked by the keys, with the focus in sight", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto("/sample");
    await ready(page);
    await page.locator(`[data-press="p:${start}"]`).focus();
    for (const key of ["ArrowLeft", "ArrowLeft", "ArrowLeft"]) await page.keyboard.press(key);
    const focused = page.locator("[data-press]:focus");
    await expect(focused).toBeInViewport({ ratio: 1 });
    const outline = await page.evaluate("getComputedStyle(document.activeElement).outlineStyle");
    expect(outline).toBe("solid");
    const key = await focused.getAttribute("data-press");
    await page.keyboard.press("Enter");
    await expect(centre(page)).toHaveAttribute("data-key", key ?? "");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sample\/person\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });
});

test.describe("the search", () => {
  test("finds by an old spelling and leads there", async ({ page }) => {
    await page.goto("/sample");
    await ready(page);
    const button = page.getByRole("button", { name: "Name or place" });
    if (await button.isVisible()) await button.click();
    const field = page.getByRole("combobox", { name: "Name or place" });
    await field.fill(nameOf(father).toUpperCase().replaceAll("И", "І"));
    const option = page.getByRole("option").first();
    await expect(option).toContainText(nameOf(father).split(" ")[1] ?? "");
    await expectAccessible(page);
    await expectNoSideScroll(page);
    await field.press("Enter");
    await expect(page).toHaveURL(/\/sample\/tree\//);
  });
});

test.describe("all branches", () => {
  test("a press on a page comes closer, back leads back", async ({ page }) => {
    await page.goto("/sample/branches");
    await ready(page);
    await map(page).getByRole("link").nth(2).click();
    await expect.poll(() => level(page)).toBe("closer");
    await expect.poll(() => searchOf(page).get("at")).not.toBeNull();
    await page.goBack();
    await expect.poll(() => level(page)).toBe("far");
  });

  test("a drag moves the map and presses nothing", async ({ page }) => {
    await page.goto(`/sample/branches?level=near&person=${start}`);
    await ready(page);
    const chosen = map(page).locator("[data-chosen]");
    const before = await chosen.boundingBox();
    if (before === null) throw new Error("nobody is chosen");
    const [x, y] = [before.x + 20, before.y + 10];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y + 80, { steps: 6 });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/sample\/branches/);
    await expect
      .poll(async () => {
        const after = await chosen.boundingBox();
        return [(after?.x ?? 0) - before.x, (after?.y ?? 0) - before.y].map(Math.round);
      })
      .toEqual([-60, 80]);
    await chosen.click();
    await expect(page).toHaveURL(`/sample/person/${start}`);
  });

  test("a wheel comes closer and goes away, level by level", async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone has no wheel");
    await page.goto(`/sample/branches?person=${start}`);
    await ready(page);
    const box = await map(page).boundingBox();
    if (box === null) throw new Error("no map");
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    const turn = async (by: number, until: string) => {
      for (let i = 0; i < 12 && (await level(page)) !== until; i += 1) {
        await page.mouse.wheel(0, by);
        await page.waitForTimeout(250);
      }
      expect(await level(page)).toBe(until);
    };
    await turn(-100, "closer");
    await turn(-100, "near");
    await turn(100, "closer");
    await turn(100, "far");
  });

  test("two fingers come closer", async ({ page, isMobile }) => {
    test.skip(!isMobile, "two fingers are for a touch screen");
    await page.goto("/sample/branches");
    await ready(page);
    const session = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", spread: number) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
          type === "touchEnd"
            ? []
            : [
                { x: 190 - spread, y: 400, id: 1 },
                { x: 190 + spread, y: 400, id: 2 },
              ],
      });
    await touch("touchStart", 20);
    for (let spread = 25; spread <= 170; spread += 5) await touch("touchMove", spread);
    await touch("touchEnd", 0);
    await expect.poll(() => level(page)).not.toBe("far");
    await expect(page).toHaveURL(/level=/);
  });

  test("a link opens the same view, in another language too", async ({ page, browser }) => {
    await page.goto(`/sample/branches?level=near&person=${father}`);
    await ready(page);
    await expect.poll(() => searchOf(page).get("at")).not.toBeNull();
    const place = await map(page).locator("[data-chosen]").boundingBox();
    const size = page.viewportSize();
    const context = await browser.newContext({ locale: "ru", viewport: size });
    const other = await context.newPage();
    await other.goto(page.url());
    await ready(other);
    await expect(map(other).locator("[data-chosen]")).toBeVisible();
    const there = await map(other).locator("[data-chosen]").boundingBox();
    expect(Math.abs((there?.x ?? 0) - (place?.x ?? 0))).toBeLessThan(3);
    expect(Math.abs((there?.y ?? 0) - (place?.y ?? 0))).toBeLessThan(3);
    await context.close();
  });

  test("is walked by the keys, and the view follows", async ({ page }) => {
    await page.goto("/sample/branches");
    await ready(page);
    await map(page).locator('a[tabindex="0"]').focus();
    await page.keyboard.press("ArrowRight");
    const branch = await page.locator("a:focus").textContent();
    expect(branch).not.toBeNull();
    await page.keyboard.press("Enter");
    await expect.poll(() => level(page)).toBe("closer");
    const focused = map(page).locator("[data-press]:focus");
    await expect(focused).toBeVisible();
    for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
      await page.keyboard.press(key);
    }
    await expect(focused).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect.poll(() => level(page)).toBe("far");
    await expect(map(page).locator("a:focus")).toBeVisible();
  });

  test("draws the names near the window and no others", async ({ page }) => {
    await page.goto(`/sample/branches?level=near&person=${start}`);
    await ready(page);
    const names = map(page).locator("[data-press]");
    expect(await names.count()).toBeGreaterThan(3);
    expect(await names.count()).toBeLessThan(160);
    await expect(map(page).locator('[data-press][tabindex="0"]')).toHaveCount(1);
  });

  test.describe("that cannot be laid out", () => {
    // A worker that breaks is an error of the console, and the page says it in words.
    test.use({ isQuiet: false });

    test("say so and lead to the list", async ({ page }) => {
      await page.route(/layout\.worker/, (route) =>
        route.fulfill({ body: "throw 1", contentType: "text/javascript" }),
      );
      await page.goto("/sample/branches");
      await expect(page.getByRole("alert")).toContainText("The branches couldn't be arranged.");
      await page.getByRole("button", { name: "As a list" }).click();
      await expect(page.getByRole("heading", { level: 1, name: nameOf(start) })).toBeVisible();
    });
  });
});

test("the list has everybody once", async ({ page }) => {
  await page.goto(`/sample/list/${start}`);
  await ready(page);
  await expect(page.locator("details h4").first()).toBeAttached();
  const links = page.locator("details a");
  expect(await links.count()).toBe(snapshot.people.length);
});

test("the card leads back to the place one came from", async ({ page }) => {
  await page.goto(`/sample/tree/${father}`);
  await ready(page);
  await page.getByRole("link", { name: "About this person" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    nameOf(father).split(" ")[0] ?? "",
  );
  await page.getByRole("link", { name: "Back to the tree" }).click();
  await expect(page).toHaveURL(`/sample/tree/${father}`);
});
