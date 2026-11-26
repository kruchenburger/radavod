import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  type BranchMap,
  branchMap,
  type MapCard,
  type MapOptions,
} from "../../../web/tree/layout/branch-map";
import { barOf, mapText } from "../../../web/tree/layout/map-text";
import { cases } from "./cases";
import { expectedLine } from "./expected";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";
import { crossings, problems } from "./geometry";

const draw = (snapshot: TreeSnapshot, more: Partial<MapOptions> = {}): BranchMap =>
  branchMap(snapshot, { measure, headOf: ({ title }) => title.ru, ...more });

/** Draws and lets the checker look at everything. */
function drawn(spec: FamilySpec | TreeSnapshot, more: Partial<MapOptions> = {}): BranchMap {
  const snapshot = "format" in spec ? spec : familyOf(spec);
  const map = draw(snapshot, more);
  const wording = wordingOf(snapshot);
  const byId = new Map(snapshot.people.map((person) => [person.id, person]));
  const cards = new Map(map.cards.map((card) => [card.key, card]));
  const found = problems(map, {
    snapshot,
    people: new Set(byId.keys()),
    children: "x",
    line: expectedLine(snapshot, more.lineOf),
    spacing: { least: 6, outside: map.pages },
    row: ({ key }) => `${cards.get(key)?.page} ${cards.get(key)?.row}`,
    lines: ({ key }) => {
      const card = cards.get(key) as MapCard;
      return mapText(card, { map, measure, wording, person: (id) => byId.get(id) });
    },
    measure,
  });
  expect(found).toEqual({});
  expect(strayLines(map)).toEqual([]);
  expect(misplaced(map)).toEqual([]);
  expect([...map.order].sort()).toEqual([...cards.keys()].sort());
  return map;
}

/**
 * Lines over the rows of the pages of others: a line belongs to the pages of its ends, and crosses
 * another page only in a gap between its rows, where nobody stands.
 */
function strayLines({ pages, links, cards, rows }: BranchMap): string[] {
  const pageOf = new Map(cards.map(({ key, page }) => [key, page]));
  return links.flatMap((link) => {
    const keys =
      link.type === "reference"
        ? [link.reference, ...link.to]
        : link.type === "union"
          ? link.partners
          : [...link.parents, link.child, link.childAt ?? "", link.parentsAt ?? ""];
    const own = new Set(keys.map((key) => pageOf.get(key)));
    return pages.flatMap(({ x, w }, i) => {
      if (own.has(i)) return [];
      const isOver = link.points.some(([bx, by], n) => {
        const [ax, ay] = link.points[n - 1] ?? [bx, by];
        const isInX = Math.max(ax, bx) > x + 0.5 && Math.min(ax, bx) < x + w - 0.5;
        const isInY = rows.some(
          ({ y, h }) => Math.max(ay, by) > y + 0.5 && Math.min(ay, by) < y + h - 0.5,
        );
        return isInX && isInY;
      });
      return isOver ? [`${keys.join(" ")} over ${i}`] : [];
    });
  });
}

/** Cards outside their page or over its head, and pages over one another. */
function misplaced({ pages, cards }: BranchMap): string[] {
  const found: string[] = [];
  for (const { key, page, x, y, w, h } of cards) {
    const home = pages[page];
    const isInside =
      home !== undefined &&
      x >= home.x &&
      x + w <= home.x + home.w &&
      y >= home.head.y + home.head.h &&
      y + h <= home.y + home.h;
    if (!isInside) found.push(key);
  }
  pages.forEach((a, i) =>
    pages.slice(i + 1).forEach((b) => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 0 && h > 0) found.push(`${a.branch} over ${b.branch}`);
    }),
  );
  return found;
}

function card(map: BranchMap, id: string): MapCard {
  const found = map.cards.find(({ person }) => person === id);
  if (found === undefined) throw new Error(`no card of ${id}`);
  return found;
}

const pageOf = (map: BranchMap, id: string): string | null =>
  map.pages[card(map, id).page]?.branch ?? null;

const references = (map: BranchMap) =>
  map.cards.flatMap(({ reference, page }) =>
    reference === undefined ? [] : [{ ...reference, on: map.pages[page]?.branch ?? null }],
  );

describe("the map of branches", () => {
  const family: FamilySpec = {
    people: [
      { id: "a", branch: "A" },
      "wife",
      { id: "older", branch: "A", parents: ["a", "wife"], born: 1 },
      { id: "son", branch: "A", parents: ["a", "wife"], born: 2 },
      "in-law",
      { id: "younger", branch: "A", parents: ["a", "wife"], born: 3 },
      { id: "youngest", branch: "A", parents: ["a", "wife"], born: 4 },
      { id: "grandson", branch: "A", parents: ["son", "in-law"] },
    ],
    unions: [
      ["a", "wife"],
      ["son", "in-law"],
    ],
    branches: ["A"],
  };

  it("has a page for every branch, the empty ones too", () => {
    const map = drawn({ ...family, branches: ["A", "B"] });
    expect(map.pages.map(({ branch, people }) => [branch, people])).toEqual([
      ["A", 6],
      ["B", 0],
    ]);
  });

  it("joins a couple: one under the other", () => {
    const map = drawn(family);
    const [a, wife] = [card(map, "a"), card(map, "wife")];
    expect([wife.x, wife.y]).toEqual([a.x, a.y + a.h]);
    expect([a.isSpouse, wife.isSpouse]).toEqual([false, true]);
    expect(map.joins).toHaveLength(2);
  });

  it("keeps generations on one row, children by birth, those without a family in a column", () => {
    const map = drawn(family);
    const children = ["older", "son", "younger", "youngest"].map((id) => card(map, id));
    expect(new Set(children.map(({ row }) => row)).size).toBe(1);
    const [older, son, younger, youngest] = children.map(({ x }) => x);
    expect(older).toBeLessThan(son ?? 0);
    expect(son).toBeLessThan(younger ?? 0);
    expect(younger).toBe(youngest);
    expect(card(map, "grandson").row).toBe(card(map, "son").row + 1);
  });

  it("puts people without a branch on the page of their kin", () => {
    const map = drawn({
      people: [
        { id: "a", branch: "A" },
        "wife",
        { id: "father", parents: [] },
        { id: "wife2", parents: ["father"] },
        { id: "ward", parents: [{ parent: "a", kind: "guardianship" }] },
        "friend",
        { id: "b", branch: "B" },
      ],
      unions: [
        ["a", "wife"],
        ["b", "wife2"],
      ],
      branches: ["A", "B"],
    });
    const pages = ["wife", "ward", "father", "wife2", "friend"].map((id) => pageOf(map, id));
    expect(pages).toEqual(["A", "A", "B", "B", null]);
    expect(map.pages.map(({ branch }) => branch)).toEqual(["A", "B", null]);
  });

  it("shows a person once, and a reference in the birth family", () => {
    const map = drawn(cases["a branch that marries a branch"] as FamilySpec);
    expect(pageOf(map, "d")).toBe("A");
    expect(references(map)).toContainEqual({ as: "child", people: ["d"], page: "A", on: "B" });
  });

  it("puts a reference above a couple whose parents are elsewhere", () => {
    const map = drawn({
      people: [
        { id: "a", branch: "A" },
        { id: "b", branch: "B", parents: ["a"] },
      ],
      branches: ["A", "B"],
    });
    expect(references(map).sort((a, b) => (a.as < b.as ? -1 : 1))).toEqual([
      { as: "child", people: ["b"], page: "B", on: "A" },
      { as: "parents", people: ["a"], page: "A", on: "B" },
    ]);
    const above = map.cards.find(({ reference }) => reference?.as === "parents");
    expect(above?.y).toBeLessThan(card(map, "b").y);
  });

  it("gives the page to the branch of the husband, whoever is told first", () => {
    const people = [
      { id: "a", branch: "A" },
      { id: "b", branch: "B" },
    ];
    const snapshot = familyOf({ people, unions: [["a", "b"]], branches: ["A", "B"] });
    expect(pageOf(drawn(snapshot), "a")).toBe("A");
    Object.assign(snapshot.people[0] ?? {}, { sex: "female" });
    Object.assign(snapshot.people[1] ?? {}, { sex: "male" });
    expect(pageOf(drawn({ ...snapshot }), "a")).toBe("B");
    Object.assign(snapshot.people[1] ?? {}, { branch: null });
    expect(pageOf(drawn({ ...snapshot }), "b")).toBe("A");
  });

  it("gives a couple the page it was given, whatever branches the two belong to", () => {
    const people = [
      { id: "a", branch: "A" },
      { id: "b", branch: "B" },
      { id: "c", branch: "A" },
    ];
    const unions: [string, string | null][] = [
      ["a", "b"],
      ["c", null],
    ];
    const snapshot = familyOf({ people, unions, branches: ["A", "B", "C"] });
    const given = (branch: string): BranchMap =>
      drawn({ ...snapshot, unions: snapshot.unions.map((union) => ({ ...union, branch })) });
    expect([pageOf(given("B"), "a"), pageOf(given("B"), "b")]).toEqual(["B", "B"]);
    expect([pageOf(given("C"), "a"), pageOf(given("C"), "c")]).toEqual(["C", "C"]);
    expect(pageOf(given("nowhere"), "a")).toBe("A");
    // The one of the two whose branch the page is stands for the couple.
    expect(card(given("B"), "a").isSpouse).toBe(true);
    expect(card(given("B"), "b").isSpouse).toBe(false);
  });

  it("draws only the direct line between pages", () => {
    const spec = cases["a branch that marries a branch"] as FamilySpec;
    const between = (map: BranchMap) => map.links.filter(({ type }) => type === "reference");
    expect(between(drawn(spec))).toEqual([]);
    const lines = between(drawn(spec, { lineOf: "e" }));
    expect(lines).toMatchObject([{ to: ["p:d"], direct: true }]);
    const page = drawn(spec, { lineOf: "e" }).pages[1];
    const isInGutter = lines[0]?.points.some(([x]) => x < (page?.x ?? 0)) ?? false;
    expect(isInGutter).toBe(true);
  });

  it("tells the direct line from the rest inside a page", () => {
    const map = drawn(family, { lineOf: "grandson" });
    const direct = map.cards.filter((c) => c.direct).map(({ person }) => person);
    expect(direct.sort()).toEqual(["a", "grandson", "in-law", "son", "wife"].sort());
  });

  it("puts all pages side by side, as high as the canvas, left to right", () => {
    const branches = Array.from({ length: 24 }, (_, i) => `b${i}`);
    const people = branches.map((branch) => ({ id: `p ${branch}`, branch }));
    const map = drawn({ people, branches });
    expect(map.pages).toHaveLength(24);
    for (const page of map.pages) expect([page.y, page.h]).toEqual([0, map.height]);
    map.pages.slice(1).forEach((page, i) => {
      expect(page.x).toBeGreaterThan((map.pages[i]?.x ?? 0) + (map.pages[i]?.w ?? 0));
    });
  });

  it("keeps a generation in one row across all pages", () => {
    const spec = cases["a branch that marries a branch"] as FamilySpec;
    const map = drawn(spec, { lineOf: "e" });
    const rowOf = (id: string) => card(map, id);
    for (const one of map.cards) {
      expect(one.y).toBeGreaterThanOrEqual(map.rows[one.row]?.y ?? 0);
      expect(one.y + one.h).toBeLessThanOrEqual(
        (map.rows[one.row]?.y ?? 0) + (map.rows[one.row]?.h ?? 0),
      );
    }
    // Partners of one generation stand in one row, whatever page they stand on.
    const reference = map.cards.find(({ reference: one }) => one?.people.includes("d"));
    expect(reference?.row).toBe(rowOf("d").row);
  });

  it("makes a page as wide as its head, within reason", () => {
    const widthOf = (title: string): number =>
      drawn({ people: [{ id: "a", branch: title }], branches: [title] }).pages[0]?.w ?? 0;
    expect(widthOf("A".repeat(25))).toBeGreaterThan(25 * 13);
    expect(widthOf("A".repeat(500))).toBeLessThan(500);
  });

  it("says nothing different when asked again", () => {
    expect(draw(familyOf(family))).toEqual(draw(familyOf(family)));
  });

  it("is empty for nobody", () => {
    expect(drawn({ people: [] })).toMatchObject({ cards: [], links: [], pages: [], order: [] });
  });
});

describe("the canvas", () => {
  it.each(Object.entries(cases))("manages %s", (_, spec) => {
    drawn(spec);
    for (const id of familyOf(spec)
      .people.slice(-2)
      .map((person) => person.id)) {
      drawn(spec, { lineOf: id });
    }
  });

  it("draws the invented family, the pages of the line side by side", () => {
    for (const seed of [1, 2, 3]) {
      const family = generateFamily(seed, 300);
      const last = family.unions.find(({ id }) => id === family.lastCouple);
      const map = drawn(snapshotOf(family), { lineOf: last?.partners[0] ?? null });
      expect(map.links.filter(({ type }) => type === "reference").length).toBeGreaterThan(0);
      expect(crossings(map.links)).toBeLessThan(150);
    }
  });
});

it("stands a bar for a name on the strip, as long as the name within bounds", () => {
  const map = draw(familyOf({ people: ["x"] }));
  const bar = (given: string): number =>
    barOf({ given, surname: "", years: "", branch: "" }, map, measure) / map.metrics.w;
  expect(bar("Ян")).toBe(0.42);
  expect(bar("Александра Мария")).toBeGreaterThan(0.6);
  expect(bar("Ш".repeat(500))).toBe(1);
});

it("draws five thousand people", () => {
  const family = generateFamily(1, 5000);
  const snapshot = snapshotOf(family);
  const last = family.unions.find(({ id }) => id === family.lastCouple);
  drawn(snapshot, { lineOf: last?.partners[0] ?? null });
}, 60_000);
