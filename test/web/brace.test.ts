import { expect, it } from "vitest";
import { brace } from "../../web/app/brace";

it("goes from one end through the tip to the other end", () => {
  const path = brace({ x: 0, y: 10 }, { x: 0, y: 110 }, { x: 40, y: 60 });
  expect(path).toMatch(/^M0 10/);
  expect(path).toContain("40 60");
  expect(path).toMatch(/0 110$/);
});

it.each([
  ["a low", { x: 40, y: 14 }],
  ["a tip level with an end", { x: 40, y: 10 }],
])("never folds back on itself: %s tip", (_, tip) => {
  const ys = [...brace({ x: 0, y: 10 }, { x: 0, y: 30 }, tip).matchAll(/V(-?[\d.]+)/g)].map(
    ([, y]) => Number(y),
  );
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  expect(ys.every((y) => y >= 10 && y <= 30)).toBe(true);
});
