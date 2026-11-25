import type { TreeBranch, TreeSnapshot } from "../../../src/shared/tree";
import { drawMapLines, planLines } from "./map-lines";
import { type MapModel, mapModelOf } from "./map-model";
import { type Placed, placeNodes } from "./map-place";
import type { Box, Card, Layout, Measure } from "./types";

export type MapLevel = "far" | "closer" | "near";

/** Sizes of the map, those of docs/design.md. Widths are whole numbers of steps. */
export type MapMetrics = {
  /** Lines in one gap between rows are this far apart, and places on the sides of cards. */
  step: number;
  /** Lines between pages are this far apart, in the gutters and where they come in. */
  apart: number;
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
    apart: 6,
    w: 36,
    line: 9,
    axis: 9,
    tick: 3,
    rows: 24,
    gutter: 21,
    padX: 15,
    padY: 15,
    head: 48,
  },
  closer: {
    step: 6,
    apart: 6,
    w: 156,
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
    apart: 8,
    w: 208,
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

/** From far, when there are more branches than inks. */
const farMetrics: MapMetrics = {
  step: 3,
  apart: 6,
  w: 24,
  line: 8,
  axis: 6,
  tick: 3,
  rows: 21,
  gutter: 18,
  padX: 9,
  padY: 15,
  head: 60,
};

export const metricsOf = (level: MapLevel, pages: number): MapMetrics =>
  level === "far" && pages > 12 ? farMetrics : mapMetrics[level];

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
  const model = mapModelOf(snapshot, options.lineOf ?? null);
  const metrics = { ...metricsOf(level, model.pages.length), ...options.metrics };
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
    placed: Placed;
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
    // A very long title is cut by the screen, the page does not grow with it.
    const head = own === undefined ? 0 : Math.min(measure(headOf(own), "head"), widestHead);
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
  const perRow = fittingPerRow(list, placed, { metrics, options });
  list.forEach((sheet, i) => {
    sheet.row = Math.floor(i / perRow);
    sheet.column = i % perRow;
  });
  return { perRow, list };
}

/** A title wider than this does not make its page wider. */
const widestHead = 360;

/** A map more than so many times as wide as high gets fewer pages in a row. */
const widest = 8;

function fittingPerRow(
  sheets: Sheet[],
  placed: Placed,
  { metrics, options: { perRow, width } }: { metrics: MapMetrics; options: MapOptions },
): number {
  let count = Math.max(1, Math.floor(perRow ?? Math.sqrt(sheets.length * 2.5) + 0.5));
  const { gutter } = metrics;
  while (width !== undefined && count > 1 && tableSize(sheets, count, gutter).w > width) count -= 1;
  // Branches of hundreds make a ribbon nobody can read. Every level has to decide the same, so the
  // pages are counted in people across and lines down, as they look from far.
  const { far } = mapMetrics;
  const counted = placed.pages.map(({ width: across, rowHeights }) => ({
    w: (across / pitchOf(metrics)) * pitchOf(far),
    h: rowHeights.reduce((sum, h) => sum + (h / metrics.line) * far.line + far.rows, far.head),
  }));
  const shape = (inRow: number): number => {
    const { w, h } = tableSize(counted, inRow, far.gutter);
    return w / h;
  };
  while (perRow === undefined && count > 1 && shape(count) > widest) count -= 1;
  return count;
}

const pitchOf = ({ w, tick, step }: MapMetrics): number => w + tick + 2 * step;

/** Columns are as wide as their widest page, rows as high as their highest. */
function tableSize(
  pages: { w: number; h: number }[],
  inRow: number,
  gutter: number,
): { w: number; h: number } {
  const widths: number[] = [];
  const heights: number[] = [];
  pages.forEach(({ w, h }, i) => {
    const [column, row] = [i % inRow, Math.floor(i / inRow)];
    widths[column] = Math.max(widths[column] ?? 0, w);
    heights[row] = Math.max(heights[row] ?? 0, h);
  });
  const total = (sizes: number[]): number =>
    sizes.reduce((sum, size) => sum + size + gutter, gutter);
  return { w: total(widths), h: total(heights) };
}
