import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import { around } from "../../web/tree/layout/around";
import type { Link, Point } from "../../web/tree/layout/types";
import { drawLine, lineKind, linePath } from "../../web/tree/line-path";
import { measure, wordingOf } from "./layout/family";

const corners = { across: 17, down: 11 };

it("is straight where nothing turns", () => {
  expect(
    linePath(
      [
        [0, 5],
        [20, 5],
        [34, 5],
      ],
      corners,
    ),
  ).toBe("M0 5L34 5");
});

it("makes the curve of a brace in its gap", () => {
  expect(
    linePath(
      [
        [0, 0],
        [17, 0],
        [17, 100],
        [34, 100],
      ],
      corners,
    ),
  ).toBe("M0 0Q17 0 17 11L17 89Q17 100 34 100");
});

it("shares a short piece between its two corners", () => {
  expect(
    linePath(
      [
        [0, 0],
        [17, 0],
        [17, 8],
        [34, 8],
      ],
      corners,
    ),
  ).toBe("M0 0Q17 0 17 4Q17 8 34 8");
});

it("draws nothing of nothing", () => {
  expect(linePath([], corners)).toBe("");
});

it("stays within the lines of the layout, ends included", () => {
  const { snapshot, start } = sampleOf(generateFamily(1, 300));
  const { links } = around(snapshot, start, {
    measure,
    wording: wordingOf(snapshot),
    siblings: true,
  });
  expect(links.length).toBeGreaterThan(20);
  for (const { points } of links) {
    if (points.length === 0) continue;
    const drawn: Point[] = [];
    const note = (...numbers: number[]): void => {
      for (let i = 0; i < numbers.length; i += 2) {
        drawn.push([numbers[i] as number, numbers[i + 1] as number]);
      }
    };
    drawLine(points, corners, { moveTo: note, lineTo: note, quadraticCurveTo: note });
    expect(drawn[0]).toEqual(points[0]);
    expect(drawn.at(-1)).toEqual(points.at(-1));
    for (const [x, y] of drawn) {
      const isOn = points.some(([px, py], i) => {
        const [qx, qy] = points[i + 1] ?? [px, py];
        return (
          x >= Math.min(px, qx) - 0.01 &&
          x <= Math.max(px, qx) + 0.01 &&
          y >= Math.min(py, qy) - 0.01 &&
          y <= Math.max(py, qy) + 0.01
        );
      });
      expect(isOn, `${x} ${y}`).toBe(true);
    }
  }
});

describe("the kind of a line", () => {
  const link = (change: object): Link =>
    ({
      type: "parentage",
      kind: "blood",
      main: true,
      direct: false,
      ...change,
    }) as Link;

  it.each([
    ["thin", {}],
    ["thin", { kind: "unknown" }],
    ["direct", { direct: true }],
    ["adopted", { kind: "adoption" }],
    ["adopted", { kind: "guardianship" }],
    ["version", { main: false }],
    ["version", { main: false, kind: "adoption" }],
    ["thin", { type: "union", kind: "marriage" }],
    ["reference", { type: "reference" }],
    // On the map the direct line goes on from a reference to the person.
    ["direct", { type: "reference", direct: true }],
  ])("%s for %j", (kind, change) => {
    expect(lineKind(link(change))).toBe(kind);
  });
});
