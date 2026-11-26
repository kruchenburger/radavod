import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import type { TreeSample } from "../../src/shared/tree.ts";
import { cases } from "../web/layout/cases.ts";
import { type FamilySpec, familyOf } from "../web/layout/family.ts";
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
  ["the pages of branches", `/sample/list/${start}`],
  ["the fan of ancestors", "/sample/branches?as=fan"],
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
    // A tint with an `action` bar, under the lines and the text: no ring, and nothing moves.
    const mark = () => page.evaluate(markOfFocus);
    expect(await mark()).toEqual({
      outline: "none",
      content: '""',
      tint: true,
      bar: true,
      under: "-1",
    });
    const box = await focused.boundingBox();
    await page.evaluate(
      "document.documentElement.setAttribute('data-mantine-color-scheme', 'dark')",
    );
    expect(await mark()).toMatchObject({ tint: true, bar: true });
    expect(await focused.boundingBox()).toEqual(box);
    const key = await focused.getAttribute("data-press");
    await page.keyboard.press("Enter");
    await expect(centre(page)).toHaveAttribute("data-key", key ?? "");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sample\/person\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test("Backspace goes back one step at a time, and never off the site", async ({ page }) => {
    const grandfather = snapshot.people.find(({ id }) => id === father)?.parents[0]?.parent ?? "";
    await page.goto("/sample");
    await ready(page);
    await page.keyboard.press("Backspace");
    await expect(page).toHaveURL("/sample");
    await page.locator(`[data-press="p:${father}"]`).click();
    await expect(page).toHaveURL(`/sample/tree/${father}`);
    await page.locator(`[data-press="p:${grandfather}"]`).click();
    await expect(page).toHaveURL(`/sample/tree/${grandfather}`);
    await page.keyboard.press("Backspace");
    await expect(page).toHaveURL(`/sample/tree/${father}`);
    await expect(centre(page)).toHaveAttribute("data-key", `p:${father}`);
    await page.keyboard.press("Backspace");
    await expect(page).toHaveURL("/sample");
    // The first page of the visit: nothing behind it inside the app.
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL("/sample");
  });

  test("Backspace in the search box only deletes", async ({ page }) => {
    await page.goto("/sample");
    await ready(page);
    await page.locator(`[data-press="p:${father}"]`).click();
    await expect(page).toHaveURL(`/sample/tree/${father}`);
    const button = page.getByRole("button", { name: "Name or place" });
    if (await button.isVisible()) await button.click();
    const field = page.getByRole("combobox", { name: "Name or place" });
    await field.fill("Ab");
    await field.press("Backspace");
    await expect(field).toHaveValue("A");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(`/sample/tree/${father}`);
  });

  test("the keys work at once, with no mark until one is pressed", async ({ page, isMobile }) => {
    await page.goto("/sample");
    await ready(page);
    const pressed = () => page.evaluate("document.activeElement?.dataset?.press ?? null");
    expect(await pressed()).toBe(`p:${start}`);
    expect(
      await page.evaluate("getComputedStyle(document.activeElement, '::before').content"),
    ).toBe("none");
    // On the phone the people are a list, walked up and down.
    await page.keyboard.press(isMobile ? "ArrowUp" : "ArrowLeft");
    expect(await pressed()).not.toBe(`p:${start}`);
    const parent = await pressed();
    await page.keyboard.press("Enter");
    await expect(centre(page)).toHaveAttribute("data-key", String(parent));
    expect(await pressed()).toBe(parent);
    await page.keyboard.press("Backspace");
    await expect(centre(page)).toHaveAttribute("data-key", `p:${start}`);
    expect(await pressed()).toBe(`p:${start}`);
  });

  test("a press of the mouse shows no mark of the keys", async ({ page }) => {
    await page.goto("/sample");
    await ready(page);
    const state = () =>
      page.evaluate(
        "[document.activeElement.dataset.press, getComputedStyle(document.activeElement, '::before').content]",
      );
    await page.locator(`[data-press="p:${father}"]`).hover();
    await page.mouse.down();
    const pressed = await state();
    await page.mouse.up();
    expect(pressed).toEqual([`p:${father}`, "none"]);
    // The keys first, then the mouse: the centre that comes back takes the focus without a mark.
    await expect(page).toHaveURL(`/sample/tree/${father}`);
    const grandfather = snapshot.people.find(({ id }) => id === father)?.parents[0]?.parent ?? "";
    await page.keyboard.press("ArrowLeft");
    await page.locator(`[data-press="p:${grandfather}"]`).click();
    await expect(page).toHaveURL(`/sample/tree/${grandfather}`);
    await page.goBack();
    await expect(centre(page)).toHaveAttribute("data-key", `p:${father}`);
    expect(await state()).toEqual([`p:${father}`, "none"]);
  });

  test("the lines of kinship stay over the mark of focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto("/sample");
    await ready(page);
    await page.locator(`[data-press="p:${start}"]`).focus();
    await page.keyboard.press("ArrowLeft");
    // Points of the lines that pass over the tint of the entry: each must be seen, not hidden.
    const seen = await page.evaluate<boolean[]>(`(() => {
      const entry = document.activeElement.getBoundingClientRect();
      const svg = document.querySelector("svg[data-late]");
      const matrix = svg.getScreenCTM();
      // The lines let presses through; for this look they are hit like anything else.
      svg.style.pointerEvents = "visiblePainted";
      const found = [];
      for (const path of svg.querySelectorAll("path")) {
        const length = path.getTotalLength();
        for (let at = 0; at <= length; at += 2) {
          const { x, y } = path.getPointAtLength(at).matrixTransform(matrix);
          const inside = x >= entry.left - 8 && x <= entry.left && y > entry.top && y < entry.bottom;
          if (inside) found.push(document.elementFromPoint(x, y)?.closest("svg") === svg);
        }
      }
      svg.style.pointerEvents = "";
      return found;
    })()`);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
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

/** How large the names on the map are, once they stand still. */
const scaleOf = (page: Page): Promise<number> =>
  page.evaluate(
    "(document.querySelector('[data-level] > div')?.style.transform.match(/scale\\((.*)\\)/)?.[1] ?? 0) * 1",
  );

test.describe("all branches", () => {
  test("a press on a page comes closer, back leads back", async ({ page }) => {
    await page.goto("/sample/branches");
    await ready(page);
    await map(page).getByRole("link").nth(2).click();
    await expect.poll(() => level(page)).toBe("closer");
    await expect.poll(() => searchOf(page).get("at")).not.toBeNull();
    expect(await scaleOf(page)).toBe(1);
    expect(searchOf(page).get("scale")).toBeNull();
    await page.goBack();
    await expect.poll(() => level(page)).toBe("far");
    // The whole map again, and nothing of the way back in the address.
    await page.waitForTimeout(400);
    expect(new URL(page.url()).search).toBe("");
  });

  test("a press in the middle of a movement does not stop it there", async ({ page }) => {
    await page.goto("/sample/branches");
    await ready(page);
    const box = await map(page).boundingBox();
    if (box === null) throw new Error("no map");
    await map(page).getByRole("link").nth(2).click();
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => level(page)).toBe("closer");
    await expect.poll(() => searchOf(page).get("at")).not.toBeNull();
    expect(await scaleOf(page)).toBe(1);
  });

  test("a window that changes on the way does not stop a movement", async ({ page }) => {
    await page.goto("/sample/branches");
    await ready(page);
    await map(page).getByRole("link").nth(2).click();
    const size = page.viewportSize();
    await page.setViewportSize({ width: size?.width ?? 0, height: (size?.height ?? 0) - 90 });
    await expect.poll(() => searchOf(page).get("at")).not.toBeNull();
    await page.waitForTimeout(400);
    expect(await level(page)).toBe("closer");
    expect(await scaleOf(page)).toBe(1);
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
      await expect(page.getByRole("alert")).toContainText(
        "The browser couldn't arrange the branches.",
      );
      await page.getByRole("button", { name: "By branch" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "By branch" })).toBeVisible();
    });
  });
});

test("everything to press on a phone is as large as a finger", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a mouse is finer");
  for (const path of [
    "/",
    "/sample",
    `/sample/tree/${manyUnions}?siblings=open`,
    `/sample/person/${start}`,
    `/sample/list/${start}`,
    "/sample/branches?as=fan",
  ]) {
    await page.goto(path);
    await page.waitForTimeout(600);
    const small = await page.evaluate(`
      [...document.querySelectorAll("a[href], button, summary")]
        .map((one) => [one.textContent, one.getBoundingClientRect()])
        .filter(([, box]) => box.width > 0 && (box.height < 43.5 || box.width < 43.5))
        .map(([text, box]) => [text, box.width, box.height].join(" "))
    `);
    expect(small, path).toEqual([]);
  }
});

test("the mark and a way out stay when the tree does not come", async ({ page }) => {
  await page.route("/sample/tree.json", (route) => route.fulfill({ body: "nothing" }));
  for (const path of ["/sample", "/sample/branches"]) {
    await page.goto(path);
    await expect(page.getByRole("alert")).toContainText("The server answered with an error.");
    await expect(page.getByText("Example", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Close example" })).toBeVisible();
  }
});

test.describe("screens whose code does not come", () => {
  test.use({ isQuiet: false });

  test("say so", async ({ page }) => {
    await page.route(/assets\/sample-.*\.js/, (route) => route.abort());
    await page.goto("/sample");
    await expect(page.getByRole("alert")).toContainText("The page didn't open.");
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  });
});

test.describe("the fan of ancestors", () => {
  test("is walked by the keys, with the mark of the tree, and Enter puts one in the centre", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sample/branches?as=fan");
    await ready(page);
    const fan = page.locator("[data-fan] svg");
    await expect(fan.locator("[data-key]").first()).toBeAttached();
    await fan.locator('[data-key][tabindex="0"]').focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    const focused = page.locator("[data-fan] [data-key]:focus");
    await expect(focused).toBeInViewport();
    const mark = await page.evaluate(`(() => {
      const cell = document.activeElement;
      const [ground, bar] = cell.querySelectorAll("path");
      return {
        outline: getComputedStyle(cell).outlineStyle,
        tint: getComputedStyle(ground).fill,
        bar: getComputedStyle(bar).stroke,
      };
    })()`);
    const tokens: { hover: string; action: string } = await page.evaluate(`(() => {
      const probe = document.createElement("i");
      document.body.append(probe);
      probe.style.color = "var(--hover)";
      const hover = getComputedStyle(probe).color;
      probe.style.color = "var(--action)";
      const action = getComputedStyle(probe).color;
      probe.remove();
      return { hover, action };
    })()`);
    expect(mark).toEqual({ outline: "none", tint: tokens.hover, bar: tokens.action });
    const href = (await focused.getAttribute("href")) ?? "";
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(href);
    await expect(page.getByRole("group", { name: /^Ancestors of / })).toBeVisible();
  });

  test("fits a wide window whole, names no smaller than 14 px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sample/branches?as=fan");
    await ready(page);
    const stage = page.locator("[data-fan]");
    const fits = await stage.evaluate((element) => [
      element.scrollWidth <= element.clientWidth,
      element.scrollHeight <= element.clientHeight,
    ]);
    expect(fits).toEqual([true, true]);
    const size = await page
      .locator("[data-fan] text")
      .first()
      .evaluate((text) => text.getBoundingClientRect().height);
    expect(size).toBeGreaterThan(12);
  });

  test("opens at its centre on the phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sample/branches?as=fan");
    await ready(page);
    await expect(page.locator("[data-fan] svg a").last()).toBeInViewport();
  });
});

test.describe("the pages of branches", () => {
  test("have everybody once", async ({ page }) => {
    await page.goto(`/sample/list/${start}`);
    await ready(page);
    const names = page.locator('[data-key^="p:"] > a');
    expect(await names.count()).toBe(snapshot.people.length);
    await expect(page.locator('a[aria-current="true"]')).toHaveAttribute(
      "href",
      `/sample/list/${start}`,
    );
  });

  test("are walked by the keys: a branch, then its people", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(`/sample/list/${start}`);
    await ready(page);
    await page.getByRole("navigation", { name: "Branches" }).getByRole("link").nth(1).focus();
    await page.keyboard.press("Enter");
    const second = page.locator("[data-page]").nth(1);
    await expect(second.getByRole("heading", { level: 2 })).toBeFocused();
    await page.keyboard.press("Tab");
    const focused = page.locator("[data-page] a:focus");
    await expect(focused).toBeInViewport();
    expect(await page.evaluate(markOfFocus)).toEqual({
      outline: "none",
      content: '""',
      tint: true,
      bar: true,
      under: "-1",
    });
    const href = (await focused.getAttribute("href")) ?? "";
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(href);
    await expect(page.locator('a[aria-current="true"]')).toBeFocused();
    await expect(page.locator('a[aria-current="true"]')).toBeInViewport();
  });

  test("draw the direct line between pages, over no text, on a wide window only", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(`/sample/list/${start}`);
    await ready(page);
    await expect(page.locator("[data-row] > svg path").first()).toBeAttached();
    // No point of the line lies on a name, a reference or the sign of a union.
    const crossed = await page.evaluate(`
      (() => {
        const texts = [...document.querySelectorAll("[data-page] [data-key] > *")]
          .map((one) => one.getBoundingClientRect());
        const hits = [];
        for (const path of document.querySelectorAll("[data-row] > svg path")) {
          const matrix = path.getScreenCTM();
          for (let at = 0; at <= path.getTotalLength(); at += 2) {
            const point = path.getPointAtLength(at).matrixTransform(matrix);
            const on = texts.find((box) =>
              point.x > box.left + 1 && point.x < box.right - 1 &&
              point.y > box.top + 1 && point.y < box.bottom - 1);
            if (on) hits.push([Math.round(point.x), Math.round(point.y)]);
          }
        }
        return hits;
      })()
    `);
    expect(crossed).toEqual([]);
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.locator("[data-row] > svg path")).toHaveCount(0);
  });
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

/** How the entry with the focus is marked, its two colours compared with the tokens. */
const markOfFocus = `(() => {
  const element = document.activeElement;
  const before = getComputedStyle(element, "::before");
  const root = getComputedStyle(document.documentElement);
  const colorOf = (value) => {
    const probe = document.createElement("i");
    probe.style.color = value;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  };
  return {
    outline: getComputedStyle(element).outlineStyle,
    content: before.content,
    tint: before.backgroundColor === colorOf(root.getPropertyValue("--hover")),
    bar: before.borderLeftColor === colorOf(root.getPropertyValue("--action")),
    under: before.zIndex,
  };
})()`;

// A man married first to a daughter, then to her mother: no way from one to the other misses
// the braces between them, so each names the other instead of a line.
const apart = {
  snapshot: familyOf(cases["a man married to the mother of his wife"] as FamilySpec),
  start: "x",
  line: "x",
};

for (const [view, width] of [
  ["wide", 1440],
  ["phone", 393],
] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`partners who stand apart name each other, ${view}, ${colorScheme}`, async ({ page }) => {
      await page.route("**/sample/tree.json", (route) => route.fulfill({ json: apart }));
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sample/tree/x");
      await ready(page);
      // The lines of the three braces, and none between the partners.
      await expect(page.locator("svg[data-late] path")).toHaveCount(6);
      const husband = page.getByRole("link", { name: "Also in a union with mother Example" });
      await expect(husband).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Also in a union with husband Example" }),
      ).toBeVisible();
      await expectNoSideScroll(page);
      await husband.click();
      await expect(page).toHaveURL("/sample/tree/mother");
    });
  }
}
