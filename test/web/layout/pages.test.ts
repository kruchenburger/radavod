import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import {
  type BranchPages,
  branchPages,
  type PageEntry,
  type PageSpot,
  routeCrossings,
} from "../../../web/tree/layout/branch-pages";
import type { Point } from "../../../web/tree/layout/types";
import { mapModelOf } from "../../../web/tree/layout/map-model";
import type { TreeSnapshot } from "../../../src/shared/tree";
import { bigSnapshot } from "./big";
import { cases } from "./cases";
import { type FamilySpec, familyOf } from "./family";

const pagesOf = (spec: FamilySpec, lineOf: string | null = null): BranchPages =>
  branchPages(familyOf(spec), lineOf);

/** Every entry of every page, in the order of reading. */
function entries({ pages }: BranchPages): (PageEntry & { page: string | null })[] {
  const all: (PageEntry & { page: string | null })[] = [];
  const walk = (entry: PageEntry, page: string | null): void => {
    if (entry.parents !== null) all.push({ ...entry.parents, page });
    all.push({ ...entry, page });
    entry.children.forEach((child) => walk(child, page));
    entry.alone.forEach((child) => walk(child, page));
    entry.partners.forEach((partner) => walk(partner, page));
  };
  for (const { branch, entries: own } of pages) own.forEach((entry) => walk(entry, branch));
  return all;
}

const people = (pages: BranchPages): string[] =>
  entries(pages).flatMap(({ person }) => (person === null ? [] : [person]));

const find = (pages: BranchPages, id: string) =>
  entries(pages).find(({ person }) => person === id) as PageEntry & { page: string | null };

/**
 * Everybody stands once, and every row of the map, a reference too, is an entry once: nothing is
 * lost and nothing doubled. The ends of the direct line are entries.
 */
function expectWhole(snapshot: TreeSnapshot, lineOf: string | null = null): BranchPages {
  const pages = branchPages(snapshot, lineOf);
  const shown = people(pages);
  expect(shown.length).toBe(new Set(shown).size);
  expect([...shown].sort()).toEqual([...new Set(snapshot.people.map(({ id }) => id))].sort());
  const keys = entries(pages).map(({ key }) => key);
  const rows = mapModelOf(snapshot, lineOf).nodes.flatMap(({ rows: own }) =>
    own.map(({ key }) => key),
  );
  expect([...keys].sort()).toEqual([...rows].sort());
  for (const { reference, to } of pages.crossings) {
    expect(keys).toContain(reference);
    expect(keys).toContain(to);
  }
  return pages;
}

const family: FamilySpec = {
  people: [
    { id: "a", branch: "A" },
    "wife",
    { id: "older", branch: "A", parents: ["a", "wife"], born: 1 },
    { id: "son", branch: "A", parents: ["a", "wife"], born: 2 },
    "in-law",
    { id: "younger", branch: "A", parents: ["a", "wife"], born: 3 },
    { id: "grandson", branch: "A", parents: ["son", "in-law"] },
    { id: "b", branch: "B" },
    { id: "bride", branch: "A", parents: ["a", "wife"], born: 4 },
    { id: "child", branch: "B", parents: ["b", "bride"] },
  ],
  unions: [
    ["a", "wife"],
    ["son", "in-law"],
    ["b", "bride"],
  ],
  branches: ["A", "B"],
};

describe("pages of branches", () => {
  it("have everybody once, a page for every branch, the empty ones too", () => {
    const pages = pagesOf({ ...family, branches: ["A", "B", "C"] });
    expect(pages.pages.map(({ branch, people: count }) => [branch, count])).toEqual([
      ["A", 6],
      ["B", 2],
      ["C", 0],
    ]);
    expectWhole(familyOf({ ...family, branches: ["A", "B", "C"] }));
  });

  it("keep the children of a partner alone apart from those of the couple", () => {
    const pages = pagesOf({
      people: [
        { id: "a", branch: "A" },
        "wife",
        { id: "both", branch: "A", parents: ["a", "wife"], born: 2 },
        { id: "hers", parents: ["wife"], born: 1 },
      ],
      unions: [["a", "wife"]],
      branches: ["A"],
    });
    const wife = find(pages, "a").partners[0];
    expect(wife?.children.map(({ person }) => person)).toEqual(["both"]);
    expect(wife?.alone.map(({ person }) => person)).toEqual(["hers"]);
  });

  it("put a partner under the person and the children of a union under the partner", () => {
    const pages = pagesOf(family);
    const a = find(pages, "a");
    expect(a.partners.map(({ person }) => person)).toEqual(["wife"]);
    expect(a.children).toEqual([]);
    const children = a.partners[0]?.children.map(({ person, reference }) =>
      person === null ? `see ${reference?.people.join()}` : person,
    );
    expect(children).toEqual(["older", "son", "younger", "see bride"]);
    expect(find(pages, "son").partners[0]?.children.map(({ person }) => person)).toEqual([
      "grandson",
    ]);
  });

  it("put a couple on the page of the husband, and a reference in the birth family", () => {
    const pages = pagesOf(family);
    expect(find(pages, "bride").page).toBe("B");
    const reference = entries(pages).find(({ reference: one }) => one?.people.includes("bride"));
    expect(reference?.page).toBe("A");
    expect(reference?.reference).toEqual({ as: "child", people: ["bride"], page: "B" });
  });

  it("tell how a child hangs from the parents", () => {
    const pages = pagesOf({
      people: ["m", { id: "x", parents: [{ parent: "m", kind: "adoption" }] }],
    });
    expect(find(pages, "x").tie).toMatchObject({ kind: "adoption", main: true, direct: false });
  });

  it("follow the direct line across pages, the line's pages side by side", () => {
    const pages = pagesOf(family, "child");
    expect(find(pages, "son").direct).toBe(false);
    expect(find(pages, "a").direct).toBe(true);
    expect(pages.crossings).toEqual([{ reference: expect.stringMatching(/^r:/), to: "p:bride" }]);
    expect(pages.pages.map(({ branch }) => branch)).toEqual(["B", "A"]);
  });

  it("put the page of nobody's kin last", () => {
    const pages = pagesOf({ people: ["alone", { id: "a", branch: "A" }], branches: ["A"] });
    expect(pages.pages.map(({ branch }) => branch)).toEqual(["A", null]);
  });

  it.each(Object.entries(cases))("manage %s", (_, spec) => {
    const snapshot = familyOf(spec);
    expectWhole(snapshot);
    for (const { id } of snapshot.people.slice(-2)) expectWhole(snapshot, id);
  });

  it("put the pages of the invented family in the order of the direct line", () => {
    for (const seed of [1, 2, 3]) {
      const invented = generateFamily(seed, 300);
      const line = invented.unions.find(({ id }) => id === invented.lastCouple)?.partners[0];
      const pages = expectWhole(snapshotOf(invented), line ?? null);
      const order = pages.pages.map(({ branch }) => branch);
      const pageOf = new Map(entries(pages).map(({ key, page }) => [key, order.indexOf(page)]));
      const apart = pages.crossings.map(({ reference, to }) =>
        Math.abs((pageOf.get(reference) ?? 0) - (pageOf.get(to) ?? 0)),
      );
      expect(apart.length).toBeGreaterThan(0);
      // Most of the line goes into the next page; nothing goes far.
      expect(apart.filter((d) => d <= 1).length).toBeGreaterThanOrEqual(apart.length / 2);
      expect(Math.max(...apart)).toBeLessThanOrEqual(3);
    }
  });

  it("have two thousand people once", () => {
    expectWhole(bigSnapshot(2000));
  });
});

describe("the direct line between pages", () => {
  const sheets = [0, 1, 2, 3].map((i) => ({ x: i * 400, w: 340 }));
  const spot = (page: number, x: number, y: number): PageSpot => ({ page, x, y, w: 80, h: 20 });
  const sizes = { rail: 12, apart: 8 };

  type Box = { x: number; y: number; w: number; h: number };
  const meets = (box: Box, [ax, ay]: Point, [bx, by]: Point): boolean =>
    Math.min(ax, bx) < box.x + box.w &&
    Math.max(ax, bx) > box.x &&
    Math.min(ay, by) < box.y + box.h &&
    Math.max(ay, by) > box.y;

  /**
   * Whether the line runs over anything it must not: it never enters the text it leaves or the
   * text it comes to, and it crosses a page only on the row of its own two ends.
   */
  function overPages(points: Point[], from: PageSpot, to: PageSpot): boolean {
    return points.slice(1).some((end, i) => {
      const start = points[i] as Point;
      if (meets(from, start, end) || meets(to, start, end)) return true;
      const isFirst = i === 0 && start[1] === end[1] && end[1] === from.y + from.h / 2;
      const isLast = i === points.length - 2 && start[1] === end[1] && end[1] === to.y + to.h / 2;
      if (isFirst || isLast) return false;
      return sheets.some((sheet) => meets({ ...sheet, y: 40, h: 2000 }, start, end));
    });
  }

  it("never enters the text it leaves or the text it comes to", () => {
    const [from, to] = [spot(0, 40, 300), spot(1, 460, 120)];
    expect(
      overPages(
        [
          [30, 310],
          [130, 310],
        ],
        from,
        to,
      ),
    ).toBe(true);
    expect(
      overPages(
        [
          [600, 130],
          [470, 130],
        ],
        from,
        to,
      ),
    ).toBe(true);
  });

  it("crosses the gutter into the next page and comes in from the left", () => {
    const [from, to] = [spot(0, 40, 300), spot(1, 460, 120)];
    const [points] = routeCrossings(sheets, [{ from, to }], sizes);
    expect(points?.[0]).toEqual([from.x + from.w + 4, 310]);
    expect(points?.at(-1)).toEqual([to.x - 4, 130]);
    expect(points?.[1]?.[0]).toBe(370);
    expect(overPages(points ?? [], from, to)).toBe(false);
  });

  it("goes over the rail to a page further on, either way", () => {
    for (const [from, to] of [
      [spot(0, 40, 300), spot(3, 1260, 500)],
      [spot(3, 1260, 300), spot(1, 460, 200)],
      [spot(2, 860, 300), spot(2, 900, 100)],
    ] as const) {
      const [points] = routeCrossings(sheets, [{ from, to }], sizes);
      expect(points?.at(-1)).toEqual([to.x - 4, to.y + 10]);
      expect(overPages(points ?? [], from, to)).toBe(false);
    }
  });

  it("keeps lines in one gutter apart", () => {
    const wires = [
      { from: spot(0, 40, 300), to: spot(1, 460, 120) },
      { from: spot(0, 40, 600), to: spot(1, 460, 420) },
    ];
    const [a, b] = routeCrossings(sheets, wires, sizes);
    expect(Math.abs((a?.[1]?.[0] ?? 0) - (b?.[1]?.[0] ?? 0))).toBe(8);
  });
});
