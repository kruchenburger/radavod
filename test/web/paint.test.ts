import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import { branchMap, type MapLevel } from "../../web/tree/layout/branch-map";
import { drawingOf, type Paint, paint } from "../../web/tree/map/paint";
import type { View } from "../../web/tree/map/view";
import { measure } from "./layout/family";

/** Remembers how many pieces it has, which is enough to tell one from another. */
class FakePath {
  pieces = 0;
  addPath(path: FakePath): void {
    this.pieces += path.pieces + 1;
  }
  rect(): void {
    this.pieces += 1;
  }
  moveTo(): void {}
  lineTo(): void {}
}

const { snapshot, start } = sampleOf(generateFamily(1, 300));
const mapOf = (level: MapLevel) =>
  branchMap(snapshot, { level, measure, headOf: ({ title }) => title.ru, lineOf: start });
const colors: Paint = { surface: "surface", ink: "ink", rule: "rule", inkOf: () => "branch" };
const window = { w: 1000, h: 600 };

beforeEach(() => {
  vi.stubGlobal("Path2D", FakePath);
});

function brush() {
  const calls: { what: string; color: unknown; width: number; dash: number[] }[] = [];
  let dash: number[] = [];
  const own = {
    lineWidth: 0,
    lineJoin: "miter" as CanvasLineJoin,
    strokeStyle: "" as string,
    fillStyle: "" as string,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: (next: number[]) => {
      dash = next;
    },
    fillRect: () => void calls.push({ what: "page", color: own.fillStyle, width: 0, dash }),
    fill: () => void calls.push({ what: "bars", color: own.fillStyle, width: 0, dash }),
    stroke: () =>
      void calls.push({ what: "line", color: own.strokeStyle, width: own.lineWidth, dash }),
  };
  return { own, calls };
}

function painted(level: MapLevel, view: Partial<View> = {}) {
  const map = mapOf(level);
  const drawing = drawingOf(map, colors, level === "far" ? ({ w }) => w : null);
  const { own, calls } = brush();
  const whole = { level, x: map.width / 2, y: map.height / 2, k: 1, ...view };
  const all = { w: map.width * 2, h: map.height * 2 };
  paint(own as never, drawing, { view: whole, window: all, unit: 1, colors });
  return { map, drawing, calls };
}

it("draws every page, every line and every bar of the far view once", () => {
  const { map, drawing, calls } = painted("far");
  expect(calls.filter(({ what }) => what === "page")).toHaveLength(map.pages.length);
  const lines = map.links.filter(({ points }) => points.length > 1).length;
  const pieces = (paths: { path: unknown }[]) =>
    paths.reduce((sum, { path }) => sum + (path as FakePath).pieces, 0);
  expect(pieces(drawing.strokes)).toBe(lines);
  expect(pieces(drawing.bars)).toBe(map.cards.length);
});

it("draws the direct line last and dark, and an adoption in dashes", () => {
  const { drawing, calls } = painted("closer");
  const kinds = drawing.strokes.map(({ kind }) => kind);
  expect(kinds.indexOf("direct")).toBeGreaterThan(kinds.lastIndexOf("adopted"));
  expect(kinds.lastIndexOf("direct")).toBe(kinds.length - 1);
  expect(calls.some(({ color }) => color === "ink")).toBe(true);
  expect(calls.some(({ dash }) => dash.length === 2)).toBe(true);
});

it("keeps lines as wide on the screen, however large the map is", () => {
  const widest = (k: number) => Math.max(...painted("near", { k }).calls.map(({ width }) => width));
  expect(widest(2) * 2).toBeCloseTo(widest(1));
});

describe("what the window does not show", () => {
  it("is left out", () => {
    const map = mapOf("near");
    const drawing = drawingOf(map, colors, null);
    const count = (view: View): number => {
      const { own, calls } = brush();
      paint(own as never, drawing, { view, window, unit: 2, colors });
      return calls.length;
    };
    const all = painted("near").calls.length;
    expect(count({ level: "near", x: 600, y: 400, k: 1 })).toBeLessThan(all / 2);
    expect(count({ level: "near", x: -9000, y: -9000, k: 1 })).toBe(0);
  });
});
