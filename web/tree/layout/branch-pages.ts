import type { TreeSnapshot } from "../../../src/shared/tree";
import { listOf } from "./kin";
import { type MapModel, type MapNode, type MapRow, mapModelOf } from "./map-model";
import type { ParentageLink, Point, Reference } from "./types";

/** How an entry hangs from the one above it. */
export type PageTie = Pick<ParentageLink, "kind" | "main" | "direct" | "certainty">;

/**
 * A person on a page, or a reference that names people who stand elsewhere. Partners stand under
 * the person, each with the children of their union; children of the person alone come first.
 */
export type PageEntry = {
  key: string;
  /** Null for a reference. */
  person: string | null;
  reference?: Reference;
  /** On the direct line. */
  direct: boolean;
  /** Null for the first of a family on its page and for a partner. */
  tie: PageTie | null;
  /** Above a couple whose parents stand on another page. */
  parents: PageEntry | null;
  partners: PageEntry[];
  children: PageEntry[];
};

export type BranchPage = {
  /** Null for the page of people who are nobody's kin. */
  branch: string | null;
  /** How many people belong to the branch, wherever they stand. */
  people: number;
  entries: PageEntry[];
};

/** A piece of the direct line from a reference to the person it names. */
export type PageCrossing = { reference: string; to: string };

export type BranchPages = { pages: BranchPage[]; crossings: PageCrossing[] };

/**
 * Every branch as a page of its own, an outline of families from the oldest down. Who stands where
 * is the map's: a person once, on the page of the couple, and a reference in the birth family.
 * Pages stand in the order the direct line goes through them, so that it crosses few of them.
 */
export function branchPages(snapshot: TreeSnapshot, lineOf: string | null): BranchPages {
  const model = mapModelOf(snapshot, lineOf);
  const entries = new Map<string, PageEntry>();
  const entryOf = (row: MapRow): PageEntry => {
    let entry = entries.get(row.key);
    if (entry === undefined) {
      entry = {
        key: row.key,
        person: row.person,
        direct: row.direct,
        tie: null,
        parents: null,
        partners: [],
        children: [],
      };
      if (row.reference !== undefined) entry.reference = row.reference;
      entries.set(row.key, entry);
    }
    return entry;
  };

  const heads = new Map<MapNode, PageEntry>();
  for (const node of model.nodes) {
    if (node.isList) continue;
    heads.set(node, couple(node, entryOf));
  }
  for (const { from, to, kind, main, direct, certainty } of model.links) {
    const owner = from.node.rows[from.row];
    const child = to.node.rows[to.row];
    if (owner === undefined || child === undefined) continue;
    const entry = to.node.isList ? entryOf(child) : (heads.get(to.node) as PageEntry);
    entry.tie = { kind, main, direct, certainty };
    entryOf(owner).children.push(entry);
  }

  const people = membersOf(snapshot, model);
  const byPage = new Map<number, PageEntry[]>();
  for (const node of model.nodes) {
    const head = heads.get(node);
    if (node.parent === null && head !== undefined) listOf(byPage, node.page).push(head);
  }
  const pages = model.pages.map((branch, i): BranchPage => ({
    branch,
    people: people[i] ?? 0,
    entries: byPage.get(i) ?? [],
  }));
  const order = pageOrder(model, lineOf);
  return {
    pages: order.map((i) => pages[i] as BranchPage),
    crossings: model.crossings.map(({ reference, to }) => ({ reference, to })),
  };
}

/**
 * The rows of a couple as entries: a reference to the parents, the person, partners under the
 * person and references to partners who stand elsewhere under whom they belong to.
 */
function couple(node: MapNode, entryOf: (row: MapRow) => PageEntry): PageEntry {
  let head: PageEntry | null = null;
  let parents: PageEntry | null = null;
  let partner: PageEntry | null = null;
  for (const row of node.rows) {
    const entry = entryOf(row);
    if (row.reference?.as === "parents") {
      parents = entry;
    } else if (head === null) {
      head = entry;
      head.parents = parents;
    } else if (row.level === 1) {
      head.partners.push(entry);
      partner = entry;
    } else {
      (partner ?? head).partners.push(entry);
    }
  }
  return head ?? entryOf(node.rows[0] as MapRow);
}

/** Members of a branch wherever they stand; the page of nobody's kin counts its own people. */
function membersOf(snapshot: TreeSnapshot, model: MapModel): number[] {
  const members = new Map<string | null, number>();
  const seen = new Set<string>();
  for (const { id, branch } of snapshot.people) {
    if (!seen.has(id)) members.set(branch, (members.get(branch) ?? 0) + 1);
    seen.add(id);
  }
  return model.pages.map((branch, i) =>
    branch === null
      ? model.nodes
          .filter(({ page }) => page === i)
          .reduce((sum, { rows }) => sum + rows.filter(({ person }) => person !== null).length, 0)
      : (members.get(branch) ?? 0),
  );
}

/**
 * Pages the direct line goes through first, beginning with the page of the person it begins with;
 * each next one where the line between the pages so far is shortest. The rest follow in their own
 * order, nobody's kin last.
 */
export function pageOrder(model: MapModel, lineOf: string | null): number[] {
  const pageOfKey = new Map<string, number>();
  for (const node of model.nodes) for (const { key } of node.rows) pageOfKey.set(key, node.page);
  const ties: [number, number][] = [];
  const near = new Map<number, number[]>();
  for (const { reference, to } of model.crossings) {
    const [a, b] = [pageOfKey.get(reference), pageOfKey.get(to)];
    if (a === undefined || b === undefined || a === b) continue;
    ties.push([a, b]);
    listOf(near, a).push(b);
    listOf(near, b).push(a);
  }
  const start = lineOf === null ? undefined : pageOfKey.get(`p:${lineOf}`);
  let row: number[] = [];
  if (start !== undefined) {
    row = [start];
    const queue = [start];
    const length = (order: number[]): number =>
      ties.reduce((sum, [a, b]) => {
        const [i, j] = [order.indexOf(a), order.indexOf(b)];
        return i < 0 || j < 0 ? sum : sum + Math.abs(i - j);
      }, 0);
    for (const page of queue) {
      for (const next of near.get(page) ?? []) {
        if (row.includes(next)) continue;
        let best = row;
        for (let at = 0; at <= row.length; at += 1) {
          const tried = [...row.slice(0, at), next, ...row.slice(at)];
          if (best === row || length(tried) <= length(best)) best = tried;
        }
        row = best;
        queue.push(next);
      }
    }
  }
  const rest = model.pages.map((_, i) => i).filter((i) => !row.includes(i));
  const nobody = rest.filter((i) => model.pages[i] === null);
  return [...row, ...rest.filter((i) => model.pages[i] !== null), ...nobody];
}

/** The box of a text on the row of pages, and the number of its page. */
export type PageSpot = { page: number; x: number; y: number; w: number; h: number };

type Sizes = {
  /** How far above the pages the first lane of the rail is. */
  rail: number;
  /** Lanes in a gutter and on the rail keep this far apart. */
  apart: number;
};

/**
 * Where the direct line runs between pages. It leaves a reference on the side of the page it goes
 * to and enters the person always from the left, where the outline is. Into the next page it
 * crosses the gutter between; within a page it runs in the gutter on the left; further it goes up
 * to the rail over the pages, along it, and down the gutter left of the page. No piece of it runs
 * over a page, except the stretch of its own row out of a reference and into a person.
 */
export function routeCrossings(
  pages: { x: number; w: number }[],
  wires: { from: PageSpot; to: PageSpot }[],
  { rail, apart }: Sizes,
): Point[][] {
  const used = new Map<number, number>();
  /** The gutter left of a page: its middle, then lanes to both sides of it. */
  const gutter = (page: number): number => {
    const own = pages[page];
    const before = pages[page - 1];
    const edge = own === undefined ? (before?.x ?? 0) + (before?.w ?? 0) + 2 * apart : own.x;
    const middle = before === undefined ? edge - 2 * apart : (before.x + before.w + edge) / 2;
    const count = used.get(page) ?? 0;
    used.set(page, count + 1);
    const side = count % 2 === 0 ? 1 : -1;
    return middle + side * Math.ceil(count / 2) * apart;
  };
  let lanes = 0;
  return wires.map(({ from, to }) => {
    const [sy, ty] = [from.y + from.h / 2, to.y + to.h / 2];
    const into: Point = [to.x - apart / 2, ty];
    const right = from.x + from.w + apart / 2;
    const left = from.x - apart / 2;
    if (to.page === from.page + 1) {
      const g = gutter(to.page);
      return [[right, sy], [g, sy], [g, ty], into];
    }
    if (to.page === from.page) {
      const g = gutter(from.page);
      return [[left, sy], [g, sy], [g, ty], into];
    }
    const isRight = to.page > from.page;
    const out = gutter(isRight ? from.page + 1 : from.page);
    const down = gutter(to.page);
    const y = rail + lanes * apart;
    lanes += 1;
    return [[isRight ? right : left, sy], [out, sy], [out, y], [down, y], [down, ty], into];
  });
}
