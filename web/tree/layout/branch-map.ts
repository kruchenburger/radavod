import type { TreeBranch, TreeSnapshot } from "../../../src/shared/tree";
import { drawMapLines, planLines } from "./map-lines";
import { type MapModel, mapModelOf } from "./map-model";
import { placeNodes } from "./map-place";
import type { Box, Card, Layout, Measure } from "./types";

export type MapLevel = "far" | "closer" | "near";

/** Sizes of the map, those of docs/design.md. Widths are whole numbers of steps. */
export type MapMetrics = {
  /** Lines in one gap or gutter are this far apart. */
  step: number;
  /** The width and the height of one person. */
  w: number;
  line: number;
  /** Where in a couple its line comes in and goes out, and how far left a column hangs. */
  axis: number;
  tick: number;
  /** The least gap between rows, and between pages. */
  rows: number;
  gutter: number;
  padX: number;
  padY: number;
  head: number;
};

export const mapMetrics: Record<MapLevel, MapMetrics> = {
  far: {
    step: 3,
    w: 39,
    line: 8,
    axis: 9,
    tick: 3,
    rows: 21,
    gutter: 21,
    padX: 15,
    padY: 15,
    head: 48,
  },
  closer: {
    step: 6,
    w: 138,
    line: 19,
    axis: 24,
    tick: 12,
    rows: 36,
    gutter: 42,
    padX: 24,
    padY: 24,
    head: 60,
  },
  near: {
    step: 8,
    w: 184,
    line: 42,
    axis: 24,
    tick: 16,
    rows: 48,
    gutter: 56,
    padX: 32,
    padY: 32,
    head: 80,
  },
};

export type MapOptions = {
  level: MapLevel;
  measure: Measure;
  /** The head of a page, with the number of people if the screen shows it. */
  headOf: (branch: TreeBranch) => string;
  /** Whose ancestors are the direct line. */
  lineOf?: string | null;
  /** Pages in a row. By default as many as give the far view its proportions. */
  perRow?: number;
  /** The most a row of pages may take. Fewer pages stand in a row when they do not fit. */
  width?: number;
  metrics?: Partial<MapMetrics>;
};

export type MapCard = Card & {
  /** The number of the page. */
  page: number;
  /** The generation on the page. */
  row: number;
  /** 1 for partners, 2 for partners of a partner. */
  level: number;
  isSpouse: boolean;
};

export type MapPage = Box & {
  /** Null for the page of people who are nobody's kin. */
  branch: string | null;
  head: Box;
  /** How many people belong to the branch, wherever they stand. */
  people: number;
  rows: { y: number; h: number }[];
};

export type BranchMap = Omit<Layout, "cards"> & {
  level: MapLevel;
  metrics: MapMetrics;
  cards: MapCard[];
  pages: MapPage[];
  perRow: number;
  /** The vertical beside a couple. */
  joins: { x: number; y: number; h: number }[];
};

/**
 * A page for every branch, the pages in rows. Levels of detail differ in sizes alone: everybody
 * keeps the page, the row and the order, and `carry` leads from a place on one level to another.
 */
export function branchMap(snapshot: TreeSnapshot, options: MapOptions): BranchMap {
  const { level } = options;
  const metrics = { ...mapMetrics[level], ...options.metrics };
  const model = mapModelOf(snapshot, options.lineOf ?? null);
  const placed = placeNodes(model, metrics);
  const plan = planLines(model, placed, metrics);
  const sheets = sheetsOf(snapshot, model, { placed, gaps: plan.gaps, metrics, options });
  const { links, grid } = drawMapLines(model, { placed, plan, sheets, metrics });

  const cards: MapCard[] = [];
  const joins: BranchMap["joins"] = [];
  for (const node of model.nodes) {
    const { x, y } = grid.corner(node);
    node.rows.forEach((row, i) => {
      const { key, person, reference, level: depth, isSpouse, direct } = row;
      const card: MapCard = {
        key,
        person,
        direct,
        isSpouse,
        level: depth,
        page: node.page,
        row: placed.rowOf(node),
        x,
        y: y + i * metrics.line,
        w: metrics.w,
        h: metrics.line,
      };
      cards.push(reference === undefined ? card : { ...card, reference });
    });
    const people = node.rows.filter(({ reference }) => reference?.as !== "parents").length;
    if (node.isList || people < 2) continue;
    const first = node.rows.length - people;
    const inset = metrics.line * 0.3;
    joins.push({
      x: x - metrics.tick * 0.55,
      y: y + first * metrics.line + inset,
      h: people * metrics.line - 2 * inset,
    });
  }
  const { width, height } = grid;
  const order = [...cards]
    .sort((a, b) => a.page - b.page || a.row - b.row || a.x - b.x || a.y - b.y)
    .map(({ key }) => key);
  return {
    level,
    metrics,
    cards,
    links,
    joins,
    order,
    width,
    height,
    perRow: sheets.perRow,
    pages: grid.pages,
  };
}

export type Sheet = {
  branch: string | null;
  people: number;
  /** In the table of pages. */
  row: number;
  column: number;
  /** The least width, head included, and the height. */
  w: number;
  h: number;
  /** Tops of rows, counted from the top of the page. */
  tops: number[];
};

export type Sheets = { perRow: number; list: Sheet[] };

function sheetsOf(
  snapshot: TreeSnapshot,
  model: MapModel,
  {
    placed,
    gaps,
    metrics,
    options,
  }: {
    placed: ReturnType<typeof placeNodes>;
    gaps: number[][];
    metrics: MapMetrics;
    options: MapOptions;
  },
): Sheets {
  const { measure, headOf } = options;
  const members = new Map<string | null, number>();
  const seen = new Set<string>();
  for (const { id, branch } of snapshot.people) {
    if (!seen.has(id)) members.set(branch, (members.get(branch) ?? 0) + 1);
    seen.add(id);
  }
  const branches = new Map<string | null, TreeBranch>();
  for (const branch of snapshot.branches) {
    if (!branches.has(branch.id)) branches.set(branch.id, branch);
  }
  const list = model.pages.map((branch, i): Sheet => {
    const { width, rowHeights } = placed.pages[i] as { width: number; rowHeights: number[] };
    const own = branches.get(branch);
    const head = own === undefined ? 0 : measure(headOf(own), "head");
    const tops: number[] = [];
    let y = metrics.head;
    rowHeights.forEach((height, row) => {
      y += gaps[i]?.[row] ?? 0;
      tops.push(y);
      y += height;
    });
    const last = gaps[i]?.[rowHeights.length] ?? 0;
    const people =
      branch === null
        ? model.nodes
            .filter(({ page }) => page === i)
            .reduce((sum, { rows }) => sum + rows.filter(({ person }) => person !== null).length, 0)
        : (members.get(branch) ?? 0);
    const w = Math.max(width, Math.ceil(head)) + 2 * metrics.padX;
    return {
      branch,
      people,
      row: 0,
      column: 0,
      w: Math.ceil(w / metrics.step) * metrics.step,
      h: y + Math.max(last, metrics.padY),
      tops,
    };
  });
  const perRow = fittingPerRow(list, metrics, options);
  list.forEach((sheet, i) => {
    sheet.row = Math.floor(i / perRow);
    sheet.column = i % perRow;
  });
  return { perRow, list };
}

function fittingPerRow(
  sheets: Sheet[],
  { gutter }: MapMetrics,
  { perRow, width }: MapOptions,
): number {
  let count = Math.max(1, Math.floor(perRow ?? Math.round(Math.sqrt(sheets.length * 2.5))));
  const widthOf = (columns: number): number => {
    const widths = Array.from({ length: columns }, () => 0);
    sheets.forEach(({ w }, i) => {
      widths[i % columns] = Math.max(widths[i % columns] ?? 0, w);
    });
    return widths.reduce((sum, w) => sum + w + gutter, gutter);
  };
  while (width !== undefined && count > 1 && widthOf(count) > width) count -= 1;
  return count;
}
