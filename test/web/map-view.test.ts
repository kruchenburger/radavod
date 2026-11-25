import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import type { MapLevel } from "../../web/tree/layout/branch-map";
import { answer } from "../../web/tree/layout/map-request";
import { personKey } from "../../web/tree/layout/types";
import {
  between,
  fit,
  hold,
  type Maps,
  pan,
  pointAt,
  reveal,
  settle,
  spotOf,
  toLevel,
  type View,
  viewOfPage,
  viewOfPerson,
  viewOfSpot,
  zoom,
} from "../../web/tree/map/view";

const { snapshot, start } = sampleOf(generateFamily(1, 300));
const mapsFor = (perRow?: number): Maps => {
  const levels: MapLevel[] = ["far", "closer", "near"];
  const [far, closer, near] = answer({
    snapshot,
    levels,
    headWidths: [],
    lineOf: start,
    ...(perRow === undefined ? {} : { perRow }),
  });
  return { far, closer, near } as Maps;
};
const maps = mapsFor();
const wide = { w: 1384, h: 700 };
const narrow = { w: 360, h: 560 };
const at = (px = 700, py = 350) => ({ maps, window: wide, px, py });

describe("from far", () => {
  it("the whole map is in a wide window", () => {
    const view = fit(maps.far, wide, false);
    const [left, top] = pointAt(view, wide, 0, 0);
    const [right, bottom] = pointAt(view, wide, wide.w, wide.h);
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(maps.far.width);
    expect(bottom).toBeGreaterThanOrEqual(maps.far.height);
  });

  it("the map is as wide as a narrow window and begins at its top", () => {
    const own = mapsFor(2);
    const view = fit(own.far, narrow, true);
    expect(own.far.width * view.k).toBeLessThanOrEqual(narrow.w);
    expect(own.far.width * view.k).toBeGreaterThan(narrow.w * 0.9);
    const [, top] = pointAt(view, narrow, 0, 0);
    expect(top).toBeLessThanOrEqual(0);
    expect(top).toBeGreaterThan(-40);
  });
});

it("dragging takes the point under the finger along", () => {
  const view: View = { level: "closer", x: 500, y: 400, k: 1.2 };
  const before = pointAt(view, wide, 300, 200);
  expect(pointAt(pan(view, 40, -25), wide, 340, 175)).toEqual([
    expect.closeTo(before[0]),
    expect.closeTo(before[1]),
  ]);
});

describe("the map does not leave the window", () => {
  it.each([
    [-1e6, -1e6],
    [1e6, 1e6],
  ])("dragged by %i, %i", (dx, dy) => {
    const view = hold(pan({ level: "near", x: 500, y: 400, k: 1 }, dx, dy), maps.near, wide);
    const [left, top] = pointAt(view, wide, 0, 0);
    expect(left).toBeGreaterThanOrEqual(-16);
    expect(top).toBeGreaterThanOrEqual(-16);
    expect(left + wide.w).toBeLessThanOrEqual(maps.near.width + 16);
    expect(top + wide.h).toBeLessThanOrEqual(maps.near.height + 16);
  });

  it("and stands in the middle when it is smaller", () => {
    const view = hold({ level: "far", x: -900, y: 4000, k: 0.2 }, maps.far, wide);
    expect([view.x, view.y]).toEqual([maps.far.width / 2, maps.far.height / 2]);
  });
});

describe("zooming", () => {
  it("keeps the point under the pointer on one level", () => {
    const view: View = { level: "near", x: 900, y: 600, k: 1 };
    const before = pointAt(view, wide, 200, 100);
    const after = pointAt(zoom(view, 1.5, at(200, 100)), wide, 200, 100);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("goes through all levels and back, and the person under it stays near", () => {
    const person = maps.near.cards.find(({ key }) => key === personKey(start));
    if (person === undefined) throw new Error("nobody");
    let view = viewOfPerson(start, "near", maps.near) as View;
    const seen: MapLevel[] = [view.level];
    for (let i = 0; i < 60; i += 1) {
      view = zoom(view, 0.93, at(wide.w / 2, wide.h / 2));
      if (seen.at(-1) !== view.level) seen.push(view.level);
    }
    expect(view.k).toBeCloseTo(fit(maps.far, wide, false).k);
    for (let i = 0; i < 60; i += 1) {
      view = zoom(view, 1 / 0.93, at(wide.w / 2, wide.h / 2));
      if (seen.at(-1) !== view.level) seen.push(view.level);
    }
    expect(seen).toEqual(["near", "closer", "far", "closer", "near"]);
    expect(view.k).toBeCloseTo(2);
    expect(spotOf(view, maps.near)?.person).toBe(start);
  });

  it("changes how large a person is by no more than it was asked to", () => {
    let view: View = fit(maps.far, wide, false);
    for (let i = 0; i < 200; i += 1) {
      const next = zoom(view, i < 100 ? 1.04 : 1 / 1.04, at(400, 300));
      const size = (one: View) => one.k * maps[one.level].metrics.w;
      expect(Math.abs(Math.log(size(next) / size(view)))).toBeLessThanOrEqual(Math.log(1.0401));
      view = next;
    }
  });

  it("does not jump back and forth where levels change", () => {
    const view: View = { level: "far", x: 400, y: 300, k: 92.5 / maps.far.metrics.w };
    const closer = zoom(view, 1, at());
    expect(closer.level).toBe("closer");
    expect(zoom(closer, 0.98, at()).level).toBe("closer");
  });
});

describe("a zoom comes to rest", () => {
  const view = (level: MapLevel, k: number): View => ({ level, x: 400, y: 300, k });

  it.each([
    ["far", 0.5, "out", "far", 0.5],
    ["far", 1.9, "in", "far", 1.9],
    ["far", 2.3, "in", "closer", 1],
    ["far", 2.3, "out", "far", 2],
    ["closer", 0.8, "in", "closer", 1],
    ["closer", 0.8, "out", "far", 2],
    ["closer", 1.2, "in", "closer", 1.2],
    ["near", 0.95, "out", "near", 1],
    ["near", 1.4, "in", "near", 1.4],
  ] as const)("%s at %d going %s", (level, k, direction, then, scale) => {
    expect(settle(view(level, k), direction, at())).toMatchObject({ level: then, k: scale });
  });
});

describe("a place in the address", () => {
  it("is the same person on another screen and in another language", () => {
    const view: View = { level: "closer", x: 1234, y: 567, k: 1 };
    const spot = spotOf(view, maps.closer);
    expect(spot).not.toBeNull();
    const there = mapsFor(2);
    const back = viewOfSpot(spot as NonNullable<typeof spot>, "closer", 1, there.closer);
    expect(spotOf(back as View, there.closer)).toEqual(spot);
  });

  it("is nothing for somebody who is not there", () => {
    expect(viewOfSpot({ person: "nobody", dx: 0, dy: 0 }, "near", 1, maps.near)).toBeNull();
    expect(viewOfPerson("nobody", "near", maps.near)).toBeNull();
    expect(viewOfPage(999, "near", maps.near, wide)).toBeNull();
    const empty = { ...maps.near, cards: [] };
    expect(spotOf({ level: "near", x: 0, y: 0, k: 1 }, empty)).toBeNull();
  });
});

it("a page that is larger than the window shows its beginning", () => {
  maps.near.pages.forEach((page, i) => {
    const view = viewOfPage(i, "near", maps.near, narrow) as View;
    const [, top] = pointAt(view, narrow, 0, 0);
    if (page.h > narrow.h) expect(Math.abs(top - page.y)).toBeLessThan(40);
    const first = maps.near.cards.find((card) => card.page === i);
    if (first !== undefined && page.w > narrow.w) expect(view.x).toBe(first.x + first.w / 2);
  });
});

describe("a focused card", () => {
  const box = { x: 1000, y: 800, w: 184, h: 42 };

  it("is brought into the window", () => {
    const view = reveal({ level: "near", x: 100, y: 100, k: 1 }, box, wide, 60);
    const [left, top] = pointAt(view, wide, 0, 0);
    expect(box.x + box.w).toBeLessThanOrEqual(left + wide.w);
    expect(box.y + box.h).toBeLessThanOrEqual(top + wide.h);
  });

  it("is not hidden by the head of its page", () => {
    const view = reveal({ level: "near", x: 1000, y: 3000, k: 1 }, box, wide, 60);
    const [, top] = pointAt(view, wide, 0, 0);
    expect(box.y - top).toBeGreaterThanOrEqual(60);
  });

  it("does not move a window that shows it", () => {
    const view: View = { level: "near", x: 1000, y: 800, k: 1 };
    expect(reveal(view, box, wide, 60)).toEqual(view);
  });
});

it("a movement begins and ends where it should, and ends on its level", () => {
  const from: View = { level: "closer", x: 10, y: 20, k: 1 };
  const to: View = { level: "closer", x: 400, y: 100, k: 1.3 };
  expect(between(from, to, 0)).toMatchObject({ x: 10, y: 20, k: 1 });
  const end = between(from, to, 1);
  expect([end.x, end.y, end.k]).toEqual([
    expect.closeTo(400),
    expect.closeTo(100),
    expect.closeTo(1.3),
  ]);
  expect(between(from, { ...to, k: 1 }, 0.5)).toMatchObject({ x: 205, y: 60, k: 1 });
});

it("levels are carried to the same spot", () => {
  const view = viewOfPerson(start, "closer", maps.closer) as View;
  const near = toLevel(view, "near", 1, at(wide.w / 2, wide.h / 2));
  expect(near).toEqual(viewOfPerson(start, "near", maps.near));
});
