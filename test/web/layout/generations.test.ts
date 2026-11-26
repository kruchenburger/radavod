import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  type GenerationsLayout,
  type GenerationsOptions,
  generations,
} from "../../../web/tree/layout/generations";
import { generationsKeys } from "../../../web/tree/layout/keys";
import type { ParentageLink } from "../../../web/tree/layout/types";
import { bigSnapshot } from "./big";
import { cases } from "./cases";
import { expectedLine } from "./expected";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";
import { problems } from "./geometry";

/**
 * Families that loop meet somebody twice. The tree by generations draws everybody once and leaves
 * the tie that would cross the drawing to the pedigree.
 */
const loops = new Map([
  ["an ancestor by two lines", ["missingLinks"]],
  ["a person married to a child, a grandchild and a parent", ["missingLinks"]],
  ["a widow, her second husband and her daughter", ["missingLinks"]],
  ["a man married to the mother of his wife", ["missingLinks"]],
  ["their own ancestors", ["missingLinks"]],
  // The second sister stands by her husband, out of the order of birth among her sisters.
  ["a man and two sisters", ["unordered"]],
]);

/** Draws and lets the checker look at everything, but for what a case may leave out. */
function drawn(
  spec: FamilySpec | TreeSnapshot,
  focus: string,
  more: Partial<GenerationsOptions> = {},
  allowed: string[] = [],
): GenerationsLayout {
  const snapshot = "format" in spec ? spec : familyOf(spec);
  const layout = generations(snapshot, focus, { measure, wording: wordingOf(snapshot), ...more });
  const byKey = new Map(layout.cards.map((card) => [card.key, card]));
  const found = problems(layout, {
    snapshot,
    people: layout.cards.map(({ person }) => person),
    children: "x",
    row: ({ y }) => String(y),
    line: expectedLine(snapshot, more.lineOf),
    lines: ({ key }) => byKey.get(key)?.lines ?? [],
    measure,
  });
  for (const kind of allowed) delete found[kind as keyof typeof found];
  expect({ focus, ...found }).toEqual({ focus });
  expect([...layout.order].sort()).toEqual([...byKey.keys()].sort());
  return layout;
}

const ids = (layout: GenerationsLayout): string[] =>
  layout.cards.map(({ person }) => person).sort();
const card = (layout: GenerationsLayout, id: string) => {
  const found = layout.cards.find(({ person }) => person === id);
  if (found === undefined) throw new Error(`no card of ${id}`);
  return found;
};

const fiveGenerations: FamilySpec = {
  people: [
    "ggf",
    "ggm",
    { id: "gf", parents: ["ggf", "ggm"] },
    "gm",
    { id: "f", parents: ["gf", "gm"], born: 1 },
    "m",
    { id: "x", parents: ["f", "m"], born: 10 },
    { id: "older", parents: ["f", "m"], born: 5 },
    { id: "younger", parents: ["f", "m"], born: 20 },
    "w1",
    "w2",
    { id: "c1", parents: ["x", "w1"], born: 30 },
    { id: "c2", parents: ["x", "w2"], born: 40 },
    { id: "c3", parents: ["x", "w2"], born: 41 },
    { id: "gc", parents: ["c2"], born: 60 },
    { id: "ggc", parents: ["gc"], born: 80 },
    { id: "ggggf" },
    { id: "gggf", parents: ["ggggf"] },
  ],
  unions: [
    ["ggf", "ggm"],
    ["gf", "gm"],
    ["f", "m"],
    ["x", "w1"],
    ["x", "w2"],
  ],
};

describe("the tree by generations", () => {
  it("has three generations up, two down, the siblings and both partners", () => {
    const layout = drawn(fiveGenerations, "x");
    expect(ids(layout)).toEqual(
      ["ggf", "ggm", "gf", "gm", "f", "m", "x", "older", "younger", "w1", "w2"]
        .concat(["c1", "c2", "c3", "gc"])
        .sort(),
    );
    const rows = layout.rows.map((row) => row.map((key) => key.slice(2)));
    expect(rows[3]).toEqual(expect.arrayContaining(["older", "x", "younger", "w1", "w2"]));
    // Partners stand on both sides, and the person once.
    const row = rows[3] ?? [];
    const at = row.indexOf("x");
    expect([row[at - 1], row[at + 1]].sort()).toEqual(["w1", "w2"]);
  });

  it("puts every generation in a row, older ones above", () => {
    const layout = drawn(fiveGenerations, "x");
    const y = (id: string) => card(layout, id).y;
    expect(y("ggf")).toBeLessThan(y("gf"));
    expect(y("gf")).toBeLessThan(y("f"));
    expect(y("f")).toBeLessThan(y("x"));
    expect(y("older")).toBe(y("x"));
    expect(y("x")).toBeLessThan(y("c1"));
    expect(y("c1")).toBe(y("c3"));
    expect(y("c2")).toBeLessThan(y("gc"));
  });

  it("drops a line from the middle of a couple to one bar over the children", () => {
    const layout = drawn(fiveGenerations, "x");
    const f = card(layout, "f");
    const m = card(layout, "m");
    const [left, right] = f.x < m.x ? [f, m] : [m, f];
    const toChildren = layout.links.filter(
      (link): link is ParentageLink =>
        link.type === "parentage" && link.parents.length === 2 && link.parents.includes("p:f"),
    );
    expect(toChildren).toHaveLength(3);
    const middle = (left.x + left.w + right.x) / 2;
    const y = left.y + left.h / 2;
    // From the edge of a partner to the middle of the couple, down to one bar.
    const bars = new Set(toChildren.map(({ points }) => points[2]?.[1]));
    expect(bars.size).toBe(1);
    for (const { points } of toChildren) {
      expect(points.slice(0, 2)).toEqual([
        [left.x + left.w, y],
        [middle, y],
      ]);
    }
  });

  it("draws the direct line dark, also when the person is not on it", () => {
    const layout = drawn(fiveGenerations, "x", { lineOf: "older" });
    const direct = layout.links.filter(({ direct }) => direct);
    expect(direct.map((link) => (link.type === "parentage" ? link.child : link.type))).toEqual(
      expect.arrayContaining(["p:older", "p:f", "p:gf", "union"]),
    );
    expect(card(layout, "x").direct).toBe(false);
    expect(card(layout, "f").direct).toBe(true);
  });

  it("is walked by the keys: up to a parent, down to a child, along a row", () => {
    const layout = drawn(fiveGenerations, "x", { lineOf: "x" });
    const move = generationsKeys(layout);
    expect(move("p:x", "up", null)).toBe("p:f");
    expect(move("p:f", "up", null)).toBe("p:gf");
    expect(move("p:f", "down", "p:x")).toBe("p:x");
    expect(move("p:c2", "up", null)).toMatch(/^p:(x|w2)$/u);
    const row = layout.rows.find((one) => one.includes("p:x")) ?? [];
    const at = row.indexOf("p:x");
    expect(move("p:x", "left", null)).toBe(row[at - 1]);
    expect(move("p:x", "right", null)).toBe(row[at + 1]);
    expect(move(row[0] ?? "", "left", null)).toBeNull();
    expect(move("p:ggf", "up", null)).toBeNull();
  });

  it("knows nobody it is not told of", () => {
    expect(
      generations(familyOf(fiveGenerations), "nobody", {
        measure,
        wording: wordingOf(familyOf(fiveGenerations)),
      }).cards,
    ).toEqual([]);
  });

  it.each(Object.entries(cases))("manages %s", (name, spec) => {
    const loose = loops.get(name) ?? [];
    for (const { id } of familyOf(spec).people) {
      drawn(spec, id, {}, loose);
      drawn(spec, id, { lineOf: id }, loose);
    }
  });
});

describe("the invented family", () => {
  const snapshot = snapshotOf(generateFamily(1, 300));
  it("is drawn right around everybody", () => {
    const lineOf = snapshot.people[0]?.id ?? null;
    for (const { id } of snapshot.people) drawn(snapshot, id, { lineOf });
  });
});

it.each([
  [300, 50],
  [2000, 200],
])(
  "lays out the tree by generations among %i people within %i ms",
  (size, bound) => {
    const snapshot = { ...bigSnapshot(size) };
    const wording = wordingOf(snapshot);
    const focus = snapshot.people[Math.floor(size / 2)]?.id ?? "";
    const start = performance.now();
    const layout = generations(snapshot, focus, { measure, wording });
    expect(performance.now() - start).toBeLessThan(bound);
    expect(layout.cards.length).toBeGreaterThan(1);
  },
  60_000,
);
