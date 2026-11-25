import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  type BranchMap,
  branchMap,
  type MapCard,
  type MapLevel,
  type MapOptions,
} from "../../../web/tree/layout/branch-map";
import { carry } from "../../../web/tree/layout/carry";
import { barOf, mapText } from "../../../web/tree/layout/map-text";
import { cases } from "./cases";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";
import { crossings, problems } from "./geometry";

const levels: MapLevel[] = ["far", "closer", "near"];

const draw = (snapshot: TreeSnapshot, more: Partial<MapOptions> = {}): BranchMap =>
  branchMap(snapshot, { level: "near", measure, headOf: ({ title }) => title.ru, ...more });

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

/** Lines over the pages of others: a line belongs to the pages of its ends. */
function strayLines({ pages, links, cards }: BranchMap): string[] {
  const pageOf = new Map(cards.map(({ key, page }) => [key, page]));
  return links.flatMap((link) => {
    const keys =
      link.type === "reference"
        ? [link.reference, ...link.to]
        : link.type === "union"
          ? link.partners
          : [...link.parents, link.child, link.childAt ?? "", link.parentsAt ?? ""];
    const own = new Set(keys.map((key) => pageOf.get(key)));
    return pages.flatMap(({ x, y, w, h }, i) => {
      if (own.has(i)) return [];
      const isOver = link.points.some(([bx, by], n) => {
        const [ax, ay] = link.points[n - 1] ?? [bx, by];
        const isInX = Math.max(ax, bx) > x + 0.5 && Math.min(ax, bx) < x + w - 0.5;
        const isInY = Math.max(ay, by) > y + 0.5 && Math.min(ay, by) < y + h - 0.5;
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

  it("puts five pages in a row for ten branches and eight for twenty-four", () => {
    const perRow = (count: number): number => {
      const branches = Array.from({ length: count }, (_, i) => `b${i}`);
      const people = branches.map((branch) => ({ id: `p ${branch}`, branch }));
      const map = drawn({ people, branches });
      return map.pages.filter(({ y }) => y === map.pages[0]?.y).length;
    };
    expect([perRow(10), perRow(24), perRow(1)]).toEqual([5, 8, 1]);
  });

  it("puts as many pages in a row as it is told, or as fit", () => {
    const branches = ["A", "B", "C", "D"];
    const people = branches.map((branch) => ({ id: branch, branch }));
    const inRow = ({ pages }: BranchMap): number =>
      pages.filter(({ y }) => y === pages[0]?.y).length;
    expect(inRow(drawn({ people, branches }, { perRow: 3 }))).toBe(3);
    const wide = drawn({ people, branches }, { perRow: 2 }).width;
    expect(inRow(drawn({ people, branches }, { perRow: 4, width: wide }))).toBe(2);
    expect(inRow(drawn({ people, branches }, { perRow: 4, width: 1 }))).toBe(1);
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

describe.each(levels)("the map at the level %s", (level) => {
  it.each(Object.entries(cases))("manages %s", (_, spec) => {
    drawn(spec, { level });
    for (const id of familyOf(spec)
      .people.slice(-2)
      .map((person) => person.id)) {
      drawn(spec, { level, lineOf: id });
    }
  });

  it("draws the invented family", () => {
    for (const seed of [1, 2, 3]) {
      const family = generateFamily(seed, 300);
      const last = family.unions.find(({ id }) => id === family.lastCouple);
      const map = drawn(snapshotOf(family), { level, lineOf: last?.partners[0] ?? null });
      expect(map.links.filter(({ type }) => type === "reference").length).toBeGreaterThan(0);
      expect(crossings(map.links)).toBeLessThan(150);
    }
  });
});

describe("levels of one map", () => {
  const family = generateFamily(1, 300);
  const snapshot = snapshotOf(family);
  const maps = levels.map((level) => drawn(snapshot, { level }));

  it("keep everybody on the same page, in the same row and order", () => {
    const told = maps.map(({ cards, order }) => ({
      order,
      places: cards.map(({ key, page, row }) => [key, page, row]),
    }));
    expect(told[1]).toEqual(told[0]);
    expect(told[2]).toEqual(told[0]);
    const rows = ({ cards }: BranchMap): Record<string, string[]> => {
      const found: Record<string, MapCard[]> = {};
      for (const c of cards) (found[`${c.page} ${c.row}`] ??= []).push(c);
      return Object.fromEntries(
        Object.entries(found).map(([row, list]) => [
          row,
          list.sort((a, b) => a.x - b.x || a.y - b.y).map(({ key }) => key),
        ]),
      );
    };
    expect(rows(maps[1] as BranchMap)).toEqual(rows(maps[0] as BranchMap));
    expect(rows(maps[2] as BranchMap)).toEqual(rows(maps[0] as BranchMap));
  });

  it("carry a place from one to another through the nearest person", () => {
    const [far, , near] = maps as [BranchMap, BranchMap, BranchMap];
    for (const { key, x, y, w, h } of far.cards.slice(0, 50)) {
      const there = near.cards.find((c) => c.key === key) as MapCard;
      const [px, py] = carry([x + w / 2, y + h / 2], far, near);
      expect(px).toBeCloseTo(there.x + there.w / 2);
      expect(py).toBeCloseTo(there.y + there.h / 2);
    }
    expect(carry([3, 5], far, { ...near, cards: [] })).toEqual([3, 5]);
  });

  it.each([10, 24])("are between 2:1 and 2.5:1 from far with %i branches", (count) => {
    const { width, height } = drawn(withBranches(count), { level: "far" });
    expect(width / height).toBeGreaterThan(2);
    expect(width / height).toBeLessThan(2.5);
  });
});

it("stands a bar for a name, as long as the name within bounds", () => {
  const map = draw(familyOf({ people: ["x"] }), { level: "far" });
  const bar = (given: string): number =>
    barOf({ given, surname: "", years: "", branch: "" }, map, measure) / map.metrics.w;
  expect(bar("Ян")).toBe(0.42);
  expect(bar("Александра Мария")).toBeGreaterThan(0.6);
  expect(bar("Ш".repeat(500))).toBe(1);
});

it("draws five thousand people, and no ribbon of them", () => {
  const family = generateFamily(1, 5000);
  const snapshot = snapshotOf(family);
  const last = family.unions.find(({ id }) => id === family.lastCouple);
  drawn(snapshot, { level: "closer", lineOf: last?.partners[0] ?? null });
  const maps = levels.map((level) => draw(snapshot, { level }));
  expect(new Set(maps.map(({ perRow }) => perRow)).size).toBe(1);
  expect((maps[0]?.width ?? 0) / (maps[0]?.height ?? 1)).toBeLessThan(8);
}, 60_000);

/** The invented families of several seeds, until there are enough branches. */
function withBranches(count: number): TreeSnapshot {
  const all: TreeSnapshot = { ...familyOf({ people: [] }) };
  const wanted = new Set<string>();
  for (let seed = 1; wanted.size < count; seed += 1) {
    const { people, unions, branches } = snapshotOf(generateFamily(seed, 300));
    const own = (id: string): string => `${seed} ${id}`;
    const kept = branches.slice(0, count - wanted.size);
    for (const branch of kept) wanted.add(own(branch.id));
    all.branches.push(...kept.map((branch) => ({ ...branch, id: own(branch.id) })));
    const isKept = (branch: string | null): boolean => branch !== null && wanted.has(own(branch));
    const ids = new Set(people.filter(({ branch }) => isKept(branch)).map(({ id }) => id));
    for (const { partners } of unions) {
      const [a, b] = partners;
      if (b === null) continue;
      // Partners without a branch come along; those of a branch left out do not.
      const branchless = (id: string): boolean =>
        people.find((person) => person.id === id)?.branch === null;
      if (ids.has(a) && branchless(b)) ids.add(b);
      if (ids.has(b) && branchless(a)) ids.add(a);
    }
    all.people.push(
      ...people
        .filter(({ id }) => ids.has(id))
        .map((person) => ({
          ...person,
          id: own(person.id),
          branch: person.branch === null ? null : own(person.branch),
          parents: person.parents.map(({ parent, ...rest }) => ({
            ...rest,
            parent: parent === null ? null : own(parent),
          })),
        })),
    );
    all.unions.push(
      ...unions
        .filter(({ partners: [a, b] }) => ids.has(a) && b !== null && ids.has(b))
        .map(({ partners: [a, b], ...union }) => ({
          ...union,
          id: own(union.id),
          partners: [own(a), b === null ? null : own(b)] as [string, string | null],
        })),
    );
  }
  return all;
}
