import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  aroundNarrow,
  type NarrowLayout,
  type NarrowOptions,
} from "../../../web/tree/layout/around-narrow";
import { cases } from "./cases";
import { expectedAround } from "./expected";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";
import { problems } from "./geometry";

function drawn(
  spec: FamilySpec | TreeSnapshot,
  focus: string,
  more: Partial<NarrowOptions> = {},
): NarrowLayout {
  const snapshot = "format" in spec ? spec : familyOf(spec);
  const options = { measure, wording: wordingOf(snapshot), width: 328, ...more };
  const layout = aroundNarrow(snapshot, focus, options);
  const byKey = new Map(layout.cards.map((card) => [card.key, card]));
  const found = problems(layout, {
    snapshot,
    people: expectedAround(snapshot, focus, { ...more, open: layout.open }),
    children: "y",
    lines: ({ key }) => byKey.get(key)?.lines ?? [],
    measure,
    isList: true,
  });
  expect({ focus, ...found }).toEqual({ focus });
  expect(layout.order).toEqual(layout.cards.map(({ key }) => key));
  return layout;
}

const card = (layout: NarrowLayout, id: string) => {
  const found = layout.cards.find(({ key }) => key === `p:${id}`);
  if (found === undefined) throw new Error(`no card of ${id}`);
  return found;
};

const people = [
  "gf",
  "gm",
  { id: "f", parents: ["gf", "gm"] },
  "m",
  { id: "older", parents: ["f", "m"], born: 1925 },
  { id: "x", parents: ["f", "m"], born: 1930 },
  { id: "half", parents: ["m"], born: 1940 },
  "w1",
  "w2",
  { id: "alone", parents: ["x"], born: 1950 },
  { id: "a", parents: ["x", "w1"], born: 1960 },
  { id: "b", parents: ["x", "w2"], born: 1970 },
  { id: "a1", parents: ["a"], born: 1990 },
];
const family: FamilySpec = {
  people,
  unions: [
    ["gf", "gm"],
    ["f", "m"],
    ["x", "w1"],
    ["x", "w2"],
  ],
};

describe("around a person on a phone", () => {
  it("lists ancestors above, partners and their children below, one under another", () => {
    const { order } = drawn(family, "x");
    const told = order.map((key) => key.slice(2));
    expect(told).toEqual("gf gm f m x alone w1 a a1 w2 b".split(" "));
  });

  it("indents every generation away from the person", () => {
    const layout = drawn(family, "x");
    const left = (id: string): number => card(layout, id).x;
    expect(left("gf")).toBeGreaterThan(left("f"));
    expect(left("f")).toBeGreaterThan(left("x"));
    expect(left("a")).toBeGreaterThan(left("w1"));
    expect(left("a1")).toBeGreaterThan(left("a"));
    expect(left("w1")).toBe(left("x"));
  });

  it("is as wide as it is told", () => {
    const layout = drawn(family, "x");
    expect(layout.width).toBe(328);
    expect(layout.cards.every(({ x, w }) => x + w === 328)).toBe(true);
  });

  it("puts unfolded siblings above the person by age", () => {
    const layout = drawn(family, "x", { siblings: true });
    const told = layout.order.map((key) => key.slice(2));
    expect(told.slice(0, 7)).toEqual("gf gm f m older half x".split(" "));
    expect(layout.siblings).toEqual(["older", "half"]);
  });

  it("puts years and branch beside a short name and under a long one", () => {
    const people = [
      { id: "x", given: "Ян", surname: "Лес", born: 1900 },
      { id: "y", given: "Александра", surname: "Полынич-Заболотская", born: 1930, parents: ["x"] },
    ];
    const layout = drawn({ people }, "x", { width: 280 });
    const ys = (id: string): number[] =>
      card(layout, id).lines.flatMap(({ part, y }) => (part === "years" ? [y] : []));
    expect(Math.max(...ys("y"))).toBeGreaterThan(20);
    const again = drawn({ people }, "y", { width: 280 });
    expect(Math.max(...card(again, "x").lines.map(({ y }) => y))).toBeLessThan(20);
  });

  it("draws the lines in the margin when somebody stands elsewhere", () => {
    const layout = drawn(cases["an ancestor by two lines"] as FamilySpec, "x");
    const right = Math.max(...layout.cards.map(({ x, w }) => x + w));
    const line = layout.links.find(({ type }) => type === "reference");
    expect(Math.max(...(line?.points ?? []).map(([x]) => x))).toBeGreaterThan(right);
    expect(layout.width).toBe(328);
  });

  it("is empty for somebody who is not there", () => {
    expect(drawn({ people: [] }, "nobody")).toMatchObject({ cards: [], focus: null, height: 0 });
  });

  it.each(Object.entries(cases))("manages %s", (_, spec) => {
    for (const { id } of familyOf(spec).people) {
      drawn(spec, id);
      drawn(spec, id, { siblings: true, width: 200 });
    }
  });

  it("draws the invented family around everybody", () => {
    const example = snapshotOf(generateFamily(1, 300));
    for (const { id } of example.people) drawn(example, id, { siblings: true });
  });
});
