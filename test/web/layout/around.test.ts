import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { hardCases } from "../../../examples/hard-cases.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  around,
  type AroundCard,
  type AroundLayout,
  type AroundOptions,
} from "../../../web/tree/layout/around";
import type { ParentageLink } from "../../../web/tree/layout/types";
import { cases } from "./cases";
import { expectedAround } from "./expected";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";
import { problems } from "./geometry";

const options = (snapshot: TreeSnapshot, more: Partial<AroundOptions> = {}): AroundOptions => ({
  measure,
  wording: wordingOf(snapshot),
  ...more,
});

/** Draws and lets the checker look at everything. */
function drawn(
  spec: FamilySpec | TreeSnapshot,
  focus: string,
  more: Partial<AroundOptions> = {},
): AroundLayout {
  const snapshot = "format" in spec ? spec : familyOf(spec);
  const layout = around(snapshot, focus, options(snapshot, more));
  const byKey = new Map(layout.cards.map((card) => [card.key, card]));
  const found = problems(layout, {
    snapshot,
    people: expectedAround(snapshot, focus, { ...more, open: layout.open }),
    children: "y",
    lines: ({ key }) => byKey.get(key)?.lines ?? [],
    measure,
  });
  expect({ focus, ...found }).toEqual({ focus });
  expect([...layout.order].sort()).toEqual([...byKey.keys()].sort());
  return layout;
}

function card(layout: AroundLayout, id: string): AroundCard {
  const found = layout.cards.find(({ key }) => key === `p:${id}`);
  if (found === undefined) throw new Error(`no card of ${id}`);
  return found;
}

const linksTo = (layout: AroundLayout, child: string): ParentageLink[] =>
  layout.links.filter(
    (link): link is ParentageLink => link.type === "parentage" && link.child === `p:${child}`,
  );

const isAscending = (values: number[]): boolean =>
  values.every((value, i) => i === 0 || value > (values[i - 1] ?? 0));

const threeGenerations: FamilySpec = {
  people: [
    "gg",
    { id: "gf", parents: ["gg"] },
    "gm",
    { id: "f", parents: ["gf", "gm"], born: 1900 },
    { id: "uncle", parents: ["gf", "gm"], born: 1905 },
    "m",
    { id: "older", parents: ["f", "m"], born: 1925 },
    { id: "x", parents: ["f", "m"], born: 1930 },
    { id: "younger", parents: ["f", "m"], born: 1935 },
    "wife",
    { id: "son", parents: ["x", "wife"], born: 1960 },
    { id: "daughter", parents: ["x", "wife"], born: 1958 },
    "in-law",
    { id: "grandson", parents: ["son", "in-law"] },
    { id: "great", parents: ["grandson"] },
    { id: "too-far", parents: ["great"] },
  ],
  unions: [
    ["f", "m"],
    ["gf", "gm"],
    ["x", "wife"],
    ["son", "in-law"],
  ],
};

describe("around a person", () => {
  it("has ancestors to the left, descendants to the right, three generations each way", () => {
    const layout = drawn(threeGenerations, "x");
    const cards = ["gg", "gf", "f", "x", "son", "grandson", "great"].map((id) => card(layout, id));
    expect(cards.map(({ generation }) => generation)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(isAscending(cards.map(({ x }) => x))).toBe(true);
    expect(layout.columns.map(({ generation }) => generation)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it("stacks the partners under the person, in the middle column", () => {
    const layout = drawn(threeGenerations, "x");
    const [focus, wife] = [card(layout, "x"), card(layout, "wife")];
    expect(wife.x).toBe(focus.x);
    expect(wife.y).toBeGreaterThanOrEqual(focus.y + focus.h);
    expect([focus.role, wife.role]).toEqual(["focus", "partner"]);
    expect(layout.focus).toBe("p:x");
  });

  it("keeps the widths of the design", () => {
    const layout = drawn(threeGenerations, "x", { siblings: true });
    const widths = layout.columns.map(({ w }) => w);
    expect(widths).toEqual([152, 152, 152, 236, 152, 152, 152]);
    const gaps = layout.columns.slice(1).map(({ x }, i) => {
      const before = layout.columns[i];
      return x - (before?.x ?? 0) - (before?.w ?? 0);
    });
    expect(gaps).toEqual([34, 34, 34, 34, 34, 34]);
  });

  it("puts children in the order of birth", () => {
    const layout = drawn(threeGenerations, "x");
    expect(isAscending([card(layout, "daughter").y, card(layout, "son").y])).toBe(true);
  });

  it("folds siblings and tells who they are", () => {
    const layout = drawn(threeGenerations, "x");
    expect(layout.siblings).toEqual(["older", "younger"]);
    expect(layout.cards.some(({ person }) => person === "older")).toBe(false);
  });

  it("unfolds them by age around the person", () => {
    const layout = drawn(threeGenerations, "x", { siblings: true });
    const cards = ["older", "x", "younger", "wife"].map((id) => card(layout, id));
    expect(isAscending(cards.map(({ y }) => y))).toBe(true);
    expect(card(layout, "older").role).toBe("sibling");
  });

  it("tells the direct line from the rest", () => {
    const layout = drawn(threeGenerations, "x", { lineOf: "grandson" });
    const direct = layout.cards.filter((c) => c.direct).map(({ person }) => person);
    const line = ["gg", "gf", "gm", "f", "m", "x", "wife", "son", "in-law", "grandson"];
    expect(direct.sort()).toEqual(line.sort());
    expect(linksTo(layout, "son").every((link) => link.direct)).toBe(true);
    expect(linksTo(layout, "daughter").some((link) => link.direct)).toBe(false);
  });

  it("has no direct line when the person is not on it", () => {
    const layout = drawn(threeGenerations, "daughter", { lineOf: "grandson" });
    expect([...layout.cards, ...layout.links].some(({ direct }) => direct)).toBe(false);
  });

  it("draws an only child with a straight line", () => {
    const layout = drawn({ people: ["x", { id: "son", parents: ["x"] }] }, "x");
    expect(linksTo(layout, "son")[0]?.points).toHaveLength(2);
  });

  it("reaches as far as it is told", () => {
    const layout = drawn(threeGenerations, "x", { up: 1, down: 2 });
    expect(layout.columns.map(({ generation }) => generation)).toEqual([-1, 0, 1, 2]);
    drawn(threeGenerations, "x", { up: 0, down: 0, siblings: true });
  });

  it("is empty for somebody who is not there", () => {
    expect(drawn({ people: ["x"] }, "nobody")).toMatchObject({ cards: [], focus: null, width: 0 });
    expect(drawn({ people: [] }, "nobody").cards).toEqual([]);
  });

  it("says nothing different when asked again", () => {
    const [once, again] = [familyOf(threeGenerations), familyOf(threeGenerations)];
    expect(around(once, "x", options(once))).toEqual(around(again, "x", options(again)));
  });
});

describe("a hard case around a person", () => {
  it("an unknown parent has a place", () => {
    const layout = drawn({ people: ["m", { id: "x", parents: ["m", null] }] }, "x");
    const place = layout.cards.find(({ person }) => person === null);
    expect(place?.unknown).toEqual({ of: "parent", child: "x", parentages: ["x-1"] });
    expect(place?.generation).toBe(-1);
    expect(linksTo(layout, "x").map(({ parents }) => parents[0])).toContain(place?.key);
  });

  it("two unknown parents have one place", () => {
    const layout = drawn({ people: [{ id: "x", parents: [null, null] }] }, "x");
    expect(layout.cards.filter(({ person }) => person === null)).toMatchObject([
      { unknown: { of: "parent", child: "x", parentages: ["x-0", "x-1"] } },
    ]);
  });

  it("a partner nobody knows has a place", () => {
    const layout = drawn({ people: ["x"], unions: [["x", null]] }, "x");
    const place = layout.cards.find(({ person }) => person === null);
    expect(place?.unknown).toEqual({ of: "partner", partner: "x", union: "u0" });
  });

  it("adoptive, guardian and second parents stand next to the blood ones", () => {
    const x = {
      id: "x",
      parents: [
        "a",
        "b",
        { parent: "c", kind: "adoption" as const },
        { parent: "d", kind: "adoption" as const },
        { parent: "e", kind: "guardianship" as const },
        { parent: "g", main: false, certainty: "contradiction" as const },
      ],
    };
    const layout = drawn({ people: ["a", "b", "c", "d", "e", "g", x], unions: [["a", "b"]] }, "x");
    const told = linksTo(layout, "x").map(({ parents, kind, main, certainty }) => [
      parents[0],
      kind,
      main,
      certainty,
    ]);
    expect(told).toEqual([
      ["p:a", "blood", true, "confirmed"],
      ["p:b", "blood", true, "confirmed"],
      ["p:c", "adoption", true, "confirmed"],
      ["p:d", "adoption", true, "confirmed"],
      ["p:e", "guardianship", true, "confirmed"],
      ["p:g", "blood", false, "contradiction"],
    ]);
  });

  it("an ancestor by two lines stands once, and a reference leads there along the margin", () => {
    const layout = drawn(
      {
        people: [
          "a",
          "b",
          "a2",
          { id: "p", parents: ["a", "b"] },
          { id: "q", parents: ["a", "b"] },
          { id: "f", parents: ["p", "a2"] },
          { id: "m", parents: ["q"] },
          { id: "x", parents: ["f", "m"] },
        ],
        unions: [
          ["a", "b"],
          ["f", "m"],
        ],
      },
      "x",
    );
    expect(linksTo(layout, "p").map(({ tree }) => tree)).toEqual([true, true]);
    const reference = layout.cards.find(({ role }) => role === "reference");
    expect(reference?.reference).toEqual({ as: "parents", people: ["a", "b"], page: null });
    expect(linksTo(layout, "q")).toMatchObject([
      { parents: ["p:a", "p:b"], parentsAt: reference?.key, tree: false },
    ]);
    const line = layout.links.find(({ type }) => type === "reference");
    const left = Math.min(...(line?.points ?? []).map(([x]) => x));
    expect(left).toBeLessThan(Math.min(...layout.cards.map(({ x }) => x)));
  });

  it("one repeated parent of two has a reference in the brace", () => {
    const people = [
      "a",
      { id: "f", parents: ["a", "f2"] },
      { id: "m", parents: ["a", "m2"] },
      "f2",
      "m2",
      { id: "x", parents: ["f", "m"] },
    ];
    const layout = drawn({ people }, "x");
    expect(linksTo(layout, "m").map(({ parents }) => parents)).toEqual([["p:a"], ["p:m2"]]);
  });

  it("an ancestor in two generations stands once", () => {
    const people = [
      "a",
      { id: "f", parents: ["a"] },
      { id: "n", parents: ["a"] },
      { id: "m", parents: ["n"] },
      { id: "x", parents: ["f", "m"] },
    ];
    expect(card(drawn({ people }, "x"), "a").generation).toBe(-2);
  });

  it.each([
    ["cousin", "wife"],
    ["aunt", "aunt"],
    ["grandparent", "a"],
    ["grandchild", "grandson"],
    ["child", "son"],
    ["parent", "f"],
  ])("a partner who is a %s", (_, partner) => {
    const people = [
      "a",
      { id: "f", parents: ["a"] },
      { id: "aunt", parents: ["a"] },
      { id: "x", parents: ["f"] },
      { id: "wife", parents: ["aunt"] },
      { id: "son", parents: ["x", "wife"] },
      { id: "grandson", parents: ["son"] },
    ];
    for (const siblings of [false, true]) {
      const layout = drawn({ people, unions: [["x", partner]] }, "x", { siblings });
      expect(card(layout, partner).generation).toBe(0);
    }
  });

  it("descendants who marry each other", () => {
    const layout = drawn(
      {
        people: [
          "x",
          { id: "a", parents: ["x"], born: 1 },
          { id: "b", parents: ["x"], born: 2 },
          { id: "c", parents: ["a"], born: 30 },
          { id: "d", parents: ["b"], born: 31 },
          { id: "e", parents: ["c", "d"] },
        ],
        unions: [["c", "d"]],
      },
      "x",
    );
    expect(linksTo(layout, "e").map(({ parents, tree }) => [parents, tree])).toEqual([
      [["p:c"], true],
      [["p:d"], false],
    ]);
    expect(layout.links.filter(({ type }) => type === "union")).toHaveLength(1);
  });

  it("twelve unions with children in each", () => {
    const wives = Array.from({ length: 12 }, (_, i) => `w${i}`);
    const children = wives.flatMap((wife, i) => [
      { id: `${wife}-1`, parents: ["x", wife], born: 1900 + i },
      { id: `${wife}-2`, parents: ["x", wife], born: 1950 + i },
    ]);
    const unions = wives.map((wife): [string, string] => ["x", wife]);
    const grandchildren = wives.flatMap((wife) => [
      { id: `${wife}-g`, parents: [`${wife}-1`] },
      { id: `${wife}-h`, parents: [`${wife}-g`] },
    ]);
    const spec = { people: ["x", ...wives, ...children, ...grandchildren], unions };
    const layout = drawn(spec, "x");
    expect(isAscending(wives.map((wife) => card(layout, wife).y))).toBe(true);
    expect(layout.open).toBe("p:w0");
    expect(card(layout, "w0-g").generation).toBe(2);
    expect(card(layout, "w1-1").folded).toBe(2);
    const other = drawn(spec, "x", { open: "p:w5", siblings: true });
    expect(card(other, "w5-h").generation).toBe(3);
    expect(other.cards.some(({ person }) => person === "w0-g")).toBe(false);
    drawn(spec, "w3-1", { siblings: true });
  });

  it("every union has a lane of its own", () => {
    const people = [
      "x",
      ...["w1", "w2"].flatMap((wife) => [
        wife,
        { id: `${wife}-1`, parents: ["x", wife] },
        { id: `${wife}-2`, parents: ["x", wife] },
      ]),
    ];
    const layout = drawn({ people }, "x");
    const lane = (child: string): number | undefined => linksTo(layout, child)[0]?.points[1]?.[0];
    expect(Math.abs((lane("w1-1") ?? 0) - (lane("w2-1") ?? 0))).toBeGreaterThanOrEqual(6);
    expect(lane("w1-1")).toBe(lane("w1-2"));
  });

  it("half-siblings, each from a parent of their own", () => {
    const people = [
      "f",
      "m",
      "other",
      { id: "x", parents: ["f", "m"], born: 5 },
      { id: "half", parents: ["f", "other"], born: 1 },
      { id: "half2", parents: ["m"], born: 9 },
      { id: "full", parents: ["m", "f"], born: 7 },
    ];
    const unions: [string, string][] = [
      ["f", "m"],
      ["f", "other"],
    ];
    drawn({ people, unions }, "x", { siblings: true });
  });

  it("people who are their own ancestors", () => {
    const people = [
      { id: "a", parents: ["c"] },
      { id: "b", parents: ["a"] },
      { id: "c", parents: ["b"] },
      { id: "self", parents: ["self"] },
    ];
    for (const id of ["a", "b", "c", "self"]) {
      for (const siblings of [false, true]) {
        drawn({ people, unions: [["a", "b"]] }, id, { siblings });
      }
    }
  });

  it("names of five hundred letters", () => {
    const long = "Слово".repeat(100);
    const people = [
      { id: "x", given: long, surname: long },
      { id: "son", given: "Ян ".repeat(160), surname: long, parents: ["x"] },
    ];
    expect(card(drawn({ people }, "x"), "son").h).toBeLessThan(150);
  });

  it("nobody named, nothing dated", () => {
    const snapshot = familyOf(threeGenerations);
    for (const person of snapshot.people) Object.assign(person, { name: null, birth: null });
    expect(drawn(snapshot, "x").cards.every(({ h }) => h >= 24)).toBe(true);
  });
});

it.each(Object.entries(cases))("the view around a person manages %s", (_, spec) => {
  for (const { id } of familyOf(spec).people) {
    drawn(spec, id);
    drawn(spec, id, { siblings: true, lineOf: id, open: "?:partner u0" });
  }
});

describe("the invented family", () => {
  const family = generateFamily(1, 300);
  const snapshot = snapshotOf(family);
  const last = family.unions.find(({ id }) => id === family.lastCouple);

  it("has all the hard cases", () => {
    expect(Object.values(hardCases(family)).filter((found) => found.length === 0)).toEqual([]);
  });

  it.each([
    ["folded", {}],
    ["unfolded", { siblings: true, lineOf: last?.partners[0] ?? null }],
  ])("is drawn right around everybody, siblings %s", (_, more) => {
    for (const { id } of snapshot.people) drawn(snapshot, id, more);
  });
});
