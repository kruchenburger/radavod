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
    entry.partners.forEach((partner) => walk(partner, page));
  };
  for (const { branch, entries: own } of pages) own.forEach((entry) => walk(entry, branch));
  return all;
}

const people = (pages: BranchPages): string[] =>
  entries(pages).flatMap(({ person }) => (person === null ? [] : [person]));

const find = (pages: BranchPages, id: string) =>
  entries(pages).find(({ person }) => person === id) as PageEntry & { page: string | null };

/** Everybody stands once; whoever stands elsewhere has a reference that names them. */
function expectWhole(pages: BranchPages, ids: string[]): void {
  const shown = people(pages);
  expect(shown.length).toBe(new Set(shown).size);
  expect([...shown].sort()).toEqual([...new Set(ids)].sort());
  const keys = new Set(entries(pages).map(({ key }) => key));
  for (const { reference, to } of pages.crossings) {
    expect(keys.has(reference)).toBe(true);
    expect(keys.has(to)).toBe(true);
  }
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
    expectWhole(
      pages,
      familyOf(family).people.map(({ id }) => id),
    );
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
    const ids = familyOf(spec).people.map(({ id }) => id);
    expectWhole(pagesOf(spec), ids);
    for (const id of ids.slice(-2)) expectWhole(pagesOf(spec, id), ids);
  });

  it("put the pages of the invented family in the order of the direct line", () => {
    for (const seed of [1, 2, 3]) {
      const invented = generateFamily(seed, 300);
      const line = invented.unions.find(({ id }) => id === invented.lastCouple)?.partners[0];
      const snapshot = snapshotOf(invented);
      const pages = branchPages(snapshot, line ?? null);
      expectWhole(
        pages,
        snapshot.people.map(({ id }) => id),
      );
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
    const snapshot = bigSnapshot(2000);
    expectWhole(
      branchPages(snapshot, null),
      snapshot.people.map(({ id }) => id),
    );
  });
});

describe("the direct line between pages", () => {
  const sheets = [0, 1, 2, 3].map((i) => ({ x: i * 400, w: 340 }));
  const spot = (page: number, x: number, y: number): PageSpot => ({ page, x, y, w: 80, h: 20 });
  const sizes = { rail: 12, apart: 8 };

  /** A piece across a page that is not the stretch out of the reference or into the person. */
  function overPages(points: Point[], from: PageSpot, to: PageSpot): boolean {
    return points.slice(1).some(([x, y], i) => {
      const [px, py] = points[i] as Point;
      const isOwnRow = (py === y && y === from.y + 10) || (py === y && y === to.y + 10);
      if (isOwnRow && (i === 0 || i === points.length - 2)) return false;
      return sheets.some((sheet) => {
        const [left, right] = [Math.min(px, x), Math.max(px, x)];
        const inside = left < sheet.x + sheet.w && right > sheet.x;
        return inside && Math.max(py, y) > 40;
      });
    });
  }

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
