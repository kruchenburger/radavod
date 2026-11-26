import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import { branchMap } from "../../web/tree/layout/branch-map";
import { personKey } from "../../web/tree/layout/types";
import {
  between,
  hold,
  pan,
  pointAt,
  restingScale,
  reveal,
  scales,
  spotOf,
  viewOfPage,
  viewOfPerson,
  viewOfSpot,
  windowOnWhole,
  zoom,
} from "../../web/tree/map/view";
import { measure } from "./layout/family";

const { snapshot, start, line } = sampleOf(generateFamily(1, 300));
const map = branchMap(snapshot, { measure, headOf: ({ title }) => title.ru, lineOf: line });
const wide = { w: 1384, h: 700 };
const narrow = { w: 360, h: 560 };
const cardOf = (person: string) => map.cards.find(({ key }) => key === personKey(person));

describe("the canvas opens", () => {
  it("on the chosen person, a little below the middle, at the scale of the names", () => {
    const view = viewOfPerson(start, map, wide) ?? { x: 0, y: 0, k: 0 };
    const card = cardOf(start);
    expect(view.k).toBe(1);
    expect(view.x).toBe((card?.x ?? 0) + (card?.w ?? 0) / 2);
    const [, top] = pointAt(view, wide, 0, wide.h / 2 + wide.h / 8);
    expect(top).toBeCloseTo((card?.y ?? 0) + (card?.h ?? 0) / 2);
  });

  it("on the first generation of a page asked for", () => {
    const view = viewOfPage(2, map, wide);
    const page = map.pages[2];
    expect(view?.x).toBeGreaterThan(page?.x ?? 0);
    expect(view?.x).toBeLessThan((page?.x ?? 0) + (page?.w ?? 0));
    expect(viewOfPage(99, map, wide)).toBeNull();
  });

  it("on nobody who is not there", () => {
    expect(viewOfPerson("nobody", map, wide)).toBeNull();
  });
});

describe("a place in the address", () => {
  it("is the same person on another screen and in another language", () => {
    const view = { x: 5000, y: 600, k: 1.2 };
    const spot = spotOf(view, map);
    expect(spot).not.toBeNull();
    const back = viewOfSpot(spot as NonNullable<typeof spot>, 1.2, map);
    expect(Math.abs((back?.x ?? 0) - view.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((back?.y ?? 0) - view.y)).toBeLessThanOrEqual(1);
  });

  it("is nothing for somebody who is not there", () => {
    expect(viewOfSpot({ person: "nobody", dx: 0, dy: 0 }, 1, map)).toBeNull();
  });
});

it("rests at no scale at which a name is below 14 px or too large", () => {
  expect(restingScale(0.1)).toBe(scales.least);
  expect(restingScale(9)).toBe(scales.most);
  expect(19 * scales.least).toBeCloseTo(14);
});

it("dragging takes the point under the finger along", () => {
  const view = { x: 3000, y: 500, k: 1 };
  const before = pointAt(view, wide, 100, 100);
  const after = pointAt(pan(view, 40, -20), wide, 140, 80);
  expect(after).toEqual(before);
});

describe("zooming", () => {
  it("keeps the point under the pointer", () => {
    const view = { x: 3000, y: 500, k: 1 };
    const before = pointAt(view, wide, 200, 300);
    const after = zoom(view, 1.3, wide, 200, 300);
    expect(pointAt(after, wide, 200, 300)[0]).toBeCloseTo(before[0]);
    expect(pointAt(after, wide, 200, 300)[1]).toBeCloseTo(before[1]);
  });

  it("stops where names would be too small or too large", () => {
    expect(zoom({ x: 0, y: 0, k: 1 }, 0.01, wide, 0, 0).k).toBe(scales.least);
    expect(zoom({ x: 0, y: 0, k: 1 }, 100, wide, 0, 0).k).toBe(scales.most);
  });
});

describe("the canvas does not leave the window", () => {
  it.each([
    [-1e6, -1e6],
    [1e6, 1e6],
  ])("from %i, %i", (x, y) => {
    const held = hold({ x, y, k: 1 }, map, wide);
    const [left, top] = pointAt(held, wide, 0, 0);
    const [right, bottom] = pointAt(held, wide, wide.w, wide.h);
    expect(right).toBeGreaterThan(0);
    expect(left).toBeLessThan(map.width);
    expect(bottom).toBeGreaterThan(0);
    expect(top).toBeLessThan(map.height);
  });

  it("and stands in the middle where it is smaller", () => {
    const small = { width: 100, height: 100 };
    expect(hold({ x: 9000, y: 9000, k: 1 }, small, narrow)).toMatchObject({ x: 50, y: 50 });
  });
});

describe("a focused card", () => {
  const card = cardOf(start);
  const box = { x: card?.x ?? 0, y: card?.y ?? 0, w: card?.w ?? 0, h: card?.h ?? 0 };

  it("is brought into the window, below the heads of the pages", () => {
    const view = reveal({ x: 0, y: 0, k: 1 }, box, wide, map.metrics.head);
    const [left, top] = pointAt(view, wide, 0, map.metrics.head);
    const [right, bottom] = pointAt(view, wide, wide.w, wide.h);
    expect(box.x).toBeGreaterThanOrEqual(left);
    expect(box.y).toBeGreaterThanOrEqual(top);
    expect(box.x + box.w).toBeLessThanOrEqual(right);
    expect(box.y + box.h).toBeLessThanOrEqual(bottom);
  });

  it("does not move a window that shows it", () => {
    const view = { x: box.x + box.w / 2, y: box.y + box.h / 2, k: 1 };
    expect(reveal(view, box, wide, map.metrics.head)).toEqual(view);
  });
});

it("a movement begins and ends where it should", () => {
  const from = { x: 100, y: 100, k: 1 };
  const to = { x: 900, y: 500, k: 1.4 };
  expect(between(from, to, 0)).toEqual(from);
  const end = between(from, to, 1);
  expect(end.x).toBeCloseTo(to.x);
  expect(end.y).toBeCloseTo(to.y);
  expect(end.k).toBeCloseTo(to.k);
});

describe("the frame of the window on the strip of the whole", () => {
  it("is where the window is, as shares of the canvas", () => {
    const view = { x: map.width / 2, y: map.height / 2, k: 1 };
    const frame = windowOnWhole(view, map, wide);
    expect(frame.w).toBeCloseTo(wide.w / map.width);
    expect(frame.x + frame.w / 2).toBeCloseTo(0.5);
  });

  it("stays on the strip at the edges", () => {
    const frame = windowOnWhole({ x: -1e5, y: -1e5, k: 1 }, map, narrow);
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.x + frame.w).toBeLessThanOrEqual(1);
  });
});
