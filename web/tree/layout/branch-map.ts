import type { TreeBranch, TreeSnapshot } from "../../../src/shared/tree";
import { membersOf, pageOrder } from "./branch-pages";
import { Track } from "./lanes";
import { type MapNode, mapModelOf } from "./map-model";
import { lanesInto, placeNodes } from "./map-place";
import type { Box, Card, Layout, Link, Measure, Point } from "./types";

/** Sizes of the canvas, those of docs/design.md. Widths are whole numbers of steps. */
export type MapMetrics = {
  /** Lines in one gap between rows are this far apart, and places on the sides of cards. */
  step: number;
  /** Lines of the direct line are this far apart, in the gutters and in their bands. */
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

const mapMetrics: MapMetrics = {
  step: 8,
  apart: 8,
  w: 208,
  line: 42,
  axis: 24,
  tick: 16,
  rows: 48,
  gutter: 56,
  padX: 32,
  padY: 24,
  head: 64,
};

export type MapOptions = {
  measure: Measure;
  /** The head of a page, with the number of people if the screen shows it. */
  headOf: (branch: TreeBranch) => string;
  /** Whose ancestors are the direct line; it also sets the order of the pages. */
  lineOf?: string | null;
  metrics?: Partial<MapMetrics>;
};

export type MapCard = Card & {
  /** The number of the page. */
  page: number;
  /** The row of generations, the same on every page. */
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
};

export type BranchMap = Omit<Layout, "cards"> & {
  metrics: MapMetrics;
  cards: MapCard[];
  /** In the order they stand, left to right. */
  pages: MapPage[];
  /** Rows of generations, across all pages. */
  rows: { y: number; h: number }[];
  /** The vertical beside a couple. */
  joins: { x: number; y: number; h: number }[];
};

/** A title wider than this does not make its page wider; the screen cuts it. */
const widestHead = 360;

/**
 * Stands for a place along a gutter before the heights of the gaps are known: gap after gap, so
 * that the lanes of a gutter are dealt out in the order of the gaps they join.
 */
const far = 1e6;

/** Lines that come to one person come one under another, as shares of the row. */
const arrivals = { column: [0.34, -0.34, 0.17, -0.17], couple: [0, 0.34, -0.34, 0.17, -0.17] };

/**
 * One wide canvas: a page for every branch, all pages side by side in the order the direct line
 * goes through them, and the generations in rows across all of them. Who stands where is the
 * model's; inside a page lines turn in the gaps between rows; between pages only the direct line
 * runs, along a band of its own at the foot of a gap, and up or down a gutter between pages. No
 * line crosses a card.
 */
export function branchMap(snapshot: TreeSnapshot, options: MapOptions): BranchMap {
  const metrics = { ...mapMetrics, ...options.metrics };
  const { step, apart, w, line, axis, tick, head } = metrics;
  const lineOf = options.lineOf ?? null;
  const model = mapModelOf(snapshot, lineOf);
  const placed = placeNodes(model, metrics);
  const order = pageOrder(model, lineOf);
  const column = new Map(order.map((page, i) => [page, i]));
  const columnOf = (node: MapNode): number => column.get(node.page) ?? 0;

  // Rows of generations, as high as their highest node.
  const generations = [...new Set(model.nodes.map(({ generation }) => generation))].sort(
    (a, b) => a - b,
  );
  const rowIndex = new Map(generations.map((generation, i) => [generation, i]));
  const rowOf = (node: MapNode): number => rowIndex.get(node.generation) ?? 0;
  const rowH = generations.map(() => line);
  for (const node of model.nodes) {
    rowH[rowOf(node)] = Math.max(rowH[rowOf(node)] ?? 0, node.rows.length * line);
  }

  // Where the direct line runs between pages, known by rows and columns before by places.
  const spots = new Map<string, { node: MapNode; row: number }>();
  for (const node of model.nodes)
    node.rows.forEach(({ key }, row) => spots.set(key, { node, row }));
  const wires = model.crossings.flatMap((crossing) => {
    const start = spots.get(crossing.reference);
    const end = spots.get(crossing.to);
    if (start === undefined || end === undefined) return [];
    const [from, to] = [rowOf(start.node), rowOf(end.node)];
    const gapFrom = from + 1;
    // Into the row of the person from the gap on the side it comes from.
    const gapTo = to > from ? to : to + 1;
    return [{ crossing, start, end, gapFrom, gapTo, gutter: columnOf(end.node) }];
  });
  const gutterTracks = order.map(() => new Track()).concat(new Track());
  for (const { crossing, gapFrom, gapTo, gutter } of wires) {
    if (gapFrom === gapTo) continue;
    gutterTracks[gutter]?.touch(crossing.family, gapFrom * far);
    gutterTracks[gutter]?.touch(crossing.family, gapTo * far);
  }
  const gutterWidths = gutterTracks.map((track) => {
    const width = Math.max(metrics.gutter, (track.lay() + 2) * apart);
    return Math.ceil(width / step) * step;
  });

  // Pages side by side.
  const branches = new Map(snapshot.branches.map((branch) => [branch.id, branch]));
  const members = membersOf(snapshot, model);
  let x = 0;
  const pageX: number[] = [];
  const pageW: number[] = [];
  const contentX: number[] = [];
  order.forEach((page, i) => {
    x += gutterWidths[i] ?? 0;
    const content = placed.pages[page]?.width ?? 0;
    const own = branches.get(model.pages[page] ?? "");
    const title =
      own === undefined ? 0 : Math.min(options.measure(options.headOf(own), "head"), widestHead);
    const width = Math.ceil((Math.max(content, title) + 2 * metrics.padX) / step) * step;
    pageX[page] = x;
    pageW[page] = width;
    contentX[page] =
      x + metrics.padX + Math.floor((width - 2 * metrics.padX - content) / 2 / step) * step;
    x += width;
  });
  const width = x + (gutterWidths[order.length] ?? metrics.gutter);
  const nodeX = (node: MapNode): number => (contentX[node.page] ?? 0) + placed.x(node);
  const gutterX = (gutter: number): number =>
    (pageX[order[gutter] ?? -1] ?? width) - (gutterWidths[gutter] ?? 0) / 2;

  // Lanes of the gaps: the lines of families above, the direct line in a band at the foot.
  const lanes = lanesInto(model);
  const slot = (node: MapNode, family: string): number => {
    const index = [...(lanes.get(node) ?? [])].indexOf(family);
    return nodeX(node) - tick - step * (Math.max(0, index) + 1);
  };
  const exitOf = (node: MapNode, family: string): number => {
    const index = node.exits.findIndex((exit) => exit.family === family);
    if (index < 0) return nodeX(node) + axis;
    return nodeX(node) + w + step * (node.exits.length - index);
  };
  const gaps = generations.length + 1;
  const busTracks = Array.from({ length: gaps }, () => new Track());
  const bandTracks = Array.from({ length: gaps }, () => new Track());
  // A vertical from below moves half a step aside where another family comes down.
  const fromAbove = new Map<string, string>();
  for (const { from, to, family } of model.links) {
    fromAbove.set(`${rowOf(to.node)} ${exitOf(from.node, family)}`, family);
  }
  /** The family whose line comes down into a column. */
  const familyAbove = (node: MapNode): string | undefined =>
    model.links.find(({ to }) => to.node === node)?.family;
  const entryOf = (node: MapNode, family: string | undefined): number => {
    const own = node.isList ? nodeX(node) - tick : nodeX(node) + axis;
    const holder = fromAbove.get(`${rowOf(node)} ${own}`);
    return holder === undefined || holder === family ? own : own + step / 2;
  };
  for (const { from, to, family } of model.links) {
    const track = busTracks[rowOf(to.node)] as Track;
    track.touch(family, exitOf(from.node, family));
    track.touch(family, entryOf(to.node, family));
  }
  const startOf = ({ start, crossing }: (typeof wires)[number]): number =>
    start.node.isList
      ? entryOf(start.node, familyAbove(start.node))
      : slot(start.node, crossing.family);
  // The direct line goes on down from its reference into the gap under the row: nothing comes up
  // there in its place.
  for (const wire of wires) fromAbove.set(`${wire.gapFrom} ${startOf(wire)}`, wire.crossing.family);
  for (const wire of wires) {
    const { crossing, end, gapFrom, gapTo, gutter } = wire;
    const target = slot(end.node, crossing.family);
    if (gapFrom === gapTo) {
      bandTracks[gapFrom]?.touch(crossing.family, startOf(wire));
      bandTracks[gapFrom]?.touch(crossing.family, target);
    } else {
      bandTracks[gapFrom]?.touch(crossing.family, startOf(wire));
      bandTracks[gapFrom]?.touch(crossing.family, gutterX(gutter));
      bandTracks[gapTo]?.touch(crossing.family, gutterX(gutter));
      bandTracks[gapTo]?.touch(crossing.family, target);
    }
  }
  const gapH = busTracks.map((track, gap) => {
    const count = track.lay();
    const bands = (bandTracks[gap] as Track).lay();
    const isInner = gap > 0 && gap < generations.length;
    const least = isInner ? metrics.rows : metrics.padY;
    const own = Math.max(least, count === 0 ? 0 : (count + 2) * step);
    return own + (bands === 0 ? 0 : (bands + 1) * apart);
  });
  const rowTop: number[] = [];
  let y = head;
  generations.forEach((_, row) => {
    y += gapH[row] ?? 0;
    rowTop[row] = y;
    y += rowH[row] ?? 0;
  });
  const height = y + (gapH[generations.length] ?? 0);
  const gapTop = (gap: number): number =>
    gap === 0 ? head : (rowTop[gap - 1] ?? 0) + (rowH[gap - 1] ?? 0);
  const bandSize = (gap: number): number => {
    const count = (bandTracks[gap] as Track).count;
    return count === 0 ? 0 : (count + 1) * apart;
  };
  const busY = (gap: number, family: string): number => {
    const track = busTracks[gap] as Track;
    const size = (gapH[gap] ?? 0) - bandSize(gap);
    const inset = (size - (Math.max(1, track.count) - 1) * step) / 2;
    return gapTop(gap) + inset + track.lane(family) * step;
  };
  const bandY = (gap: number, family: string): number => {
    const top = gapTop(gap) + (gapH[gap] ?? 0) - bandSize(gap);
    return top + apart + (bandTracks[gap] as Track).lane(family) * apart;
  };
  const laneX = (gutter: number, family: string): number => {
    const track = gutterTracks[gutter] as Track;
    return gutterX(gutter) + (track.lane(family) - (Math.max(1, track.count) - 1) / 2) * apart;
  };
  const corner = (node: MapNode): { x: number; y: number } => ({
    x: nodeX(node),
    y: rowTop[rowOf(node)] ?? 0,
  });
  const rowY = ({ node, row }: { node: MapNode; row: number }): number =>
    corner(node).y + (row + 0.5) * line;

  const links: Link[] = model.links.map(({ from, to, ...link }): Link => {
    const { x: left, y: top } = corner(from.node);
    const exit = exitOf(from.node, link.family);
    const shift = exitShift(from.node, link.family);
    const points: Point[] =
      shift === null
        ? [[exit, top + from.node.rows.length * line]]
        : [
            [left + w, rowY(from) + shift * line],
            [exit, rowY(from) + shift * line],
          ];
    const entry = entryOf(to.node, link.family);
    const child = corner(to.node);
    if (entry !== exit) {
      const lane = busY(rowOf(to.node), link.family);
      points.push([exit, lane], [entry, lane]);
    }
    if (to.node.isList) points.push([entry, rowY(to)], [child.x, rowY(to)]);
    else points.push([entry, child.y]);
    return { ...link, points };
  });
  const arrived = new Map<string, number>();
  for (const wire of wires) {
    const { crossing, start, end, gapFrom, gapTo, gutter } = wire;
    const { family } = crossing;
    const startX = startOf(wire);
    const target = slot(end.node, family);
    const count = arrived.get(crossing.to) ?? 0;
    arrived.set(crossing.to, count + 1);
    const places = end.node.isList ? arrivals.column : arrivals.couple;
    const inRow = rowY(end) + line * (places[count % places.length] ?? 0);
    const points: Point[] = [
      [corner(start.node).x, rowY(start)],
      [startX, rowY(start)],
      [startX, bandY(gapFrom, family)],
    ];
    if (gapFrom !== gapTo) {
      const across = laneX(gutter, family);
      points.push([across, bandY(gapFrom, family)], [across, bandY(gapTo, family)]);
    }
    points.push([target, bandY(gapTo, family)], [target, inRow], [corner(end.node).x, inRow]);
    links.push({
      type: "reference",
      reference: crossing.reference,
      to: [crossing.to],
      family,
      certainty: crossing.certainty,
      direct: true,
      points,
    });
  }
  for (const union of model.unions) links.push({ ...union, points: [] });

  const cards: MapCard[] = [];
  const joins: BranchMap["joins"] = [];
  for (const node of model.nodes) {
    const { x: left, y: top } = corner(node);
    node.rows.forEach((row, i) => {
      const { key, person, reference, level, isSpouse, direct } = row;
      const card: MapCard = {
        key,
        person,
        direct,
        isSpouse,
        level,
        page: node.page,
        row: rowOf(node),
        x: left,
        y: top + i * line,
        w,
        h: line,
      };
      cards.push(reference === undefined ? card : { ...card, reference });
    });
    const people = node.rows.filter(({ reference }) => reference?.as !== "parents").length;
    if (node.isList || people < 2) continue;
    const first = node.rows.length - people;
    const inset = line * 0.3;
    joins.push({
      x: left - tick * 0.55,
      y: top + first * line + inset,
      h: people * line - 2 * inset,
    });
  }
  const pages: MapPage[] = order.map((page) => {
    const [px, pw] = [pageX[page] ?? 0, pageW[page] ?? 0];
    return {
      branch: model.pages[page] ?? null,
      people: members[page] ?? 0,
      x: px,
      y: 0,
      w: pw,
      h: height,
      head: { x: px, y: 0, w: pw, h: head },
    };
  });
  const position = new Map(order.map((page, i) => [page, i]));
  const ordered = [...cards].sort(
    (a, b) =>
      (position.get(a.page) ?? 0) - (position.get(b.page) ?? 0) ||
      a.row - b.row ||
      a.x - b.x ||
      a.y - b.y,
  );
  // Cards name the page by its place in the row, as the pages stand.
  for (const card of cards) card.page = position.get(card.page) ?? 0;
  return {
    metrics,
    cards,
    links,
    joins,
    order: ordered.map(({ key }) => key),
    width: model.nodes.length === 0 && order.length === 0 ? 0 : width,
    height: model.nodes.length === 0 && order.length === 0 ? 0 : height,
    pages,
    rows: rowTop.map((top, row) => ({ y: top, h: rowH[row] ?? 0 })),
  };
}

/** Families that leave the same row on the right leave it one under another. */
function exitShift(node: MapNode, family: string): number | null {
  const exit = node.exits.find((found) => found.family === family);
  if (exit === undefined) return null;
  const same = node.exits.filter(({ row }) => row === exit.row);
  return (same.indexOf(exit) - (same.length - 1) / 2) * 0.4;
}
