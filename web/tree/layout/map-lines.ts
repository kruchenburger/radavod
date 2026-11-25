import type { MapMetrics, MapPage, Sheet, Sheets } from "./branch-map";
import { listOf } from "./kin";
import { Track } from "./lanes";
import type { Crossing, MapModel, MapNode } from "./map-model";
import { lanesInto, type Placed } from "./map-place";
import type { Link, Point } from "./types";

/**
 * Lines of the map. Inside a page they turn in the gaps over, between and under the rows; between
 * pages they run in gutters beside the columns of pages and in streets between the rows of pages.
 * None of these has a card in it.
 */
export type MapPlan = {
  /** By page: the gap over every row, and the one under the last. */
  gaps: number[][];
  tracks: Track[][];
  /** Where the line of a node comes in, from the left edge of the contents. */
  entry: (node: MapNode) => number;
  wires: Wire[];
};

type Wire = {
  crossing: Crossing;
  from: { node: MapNode; row: number; x: number; gap: number };
  to: { node: MapNode; row: number; x: number; gap: number };
  /** Stays in one gap of one page. */
  isShort: boolean;
};

const far = 1e9;

export function planLines(model: MapModel, placed: Placed, metrics: MapMetrics): MapPlan {
  const { step, axis, tick } = metrics;
  const tracks = placed.pages.map(({ rowHeights }) =>
    Array.from({ length: rowHeights.length + 1 }, () => new Track()),
  );
  const trackAt = (page: number, gap: number): Track => tracks[page]?.[gap] as Track;

  // Verticals that come into a gap from above, by place.
  const fromAbove = new Map<string, string>();
  const place = (page: number, gap: number, x: number): string => `${page} ${gap} ${x}`;
  /** A place for a vertical from below that no other family holds above. */
  const clear = (page: number, gap: number, x: number, family: string): number => {
    const shifts = [0, step / 2, -step / 2];
    const isFree = (shift: number): boolean => {
      const holder = fromAbove.get(place(page, gap, x + shift));
      return holder === undefined || holder === family;
    };
    return x + (shifts.find(isFree) ?? 0);
  };

  const entries = new Map<MapNode, number>();
  const familyOf = new Map<MapNode, string>();
  for (const { from, to, family } of model.links) {
    familyOf.set(to.node, family);
    fromAbove.set(place(to.node.page, placed.rowOf(to.node), exitX(from, placed, metrics)), family);
  }

  // Crossings by the node their line leaves, so that a column knows its vertical goes on below.
  const spots = new Map<string, { node: MapNode; row: number }>();
  for (const node of model.nodes) node.rows.forEach(({ key }, row) => spots.set(key, { node, row }));
  const lanes = lanesInto(model);
  const slot = (node: MapNode, family: string): number => {
    const index = [...(lanes.get(node) ?? [])].indexOf(family);
    return placed.x(node) - tick - step * (Math.max(0, index) + 1);
  };
  const leaving = new Map<MapNode, Crossing[]>();
  const drafts: Omit<Wire, "from" | "to">[] = [];
  const routes = new Map<Crossing, { gapFrom: number; gapTo: number }>();
  for (const crossing of model.crossings) {
    const start = spots.get(crossing.reference);
    const end = spots.get(crossing.to);
    if (start === undefined || end === undefined) continue;
    const [rowFrom, rowTo] = [placed.rowOf(start.node), placed.rowOf(end.node)];
    const isOnePage = start.node.page === end.node.page;
    // Up into the gap over the row when the person stands in the same one.
    const gapFrom = isOnePage && rowFrom === rowTo ? rowFrom : rowFrom + 1;
    routes.set(crossing, { gapFrom, gapTo: rowTo });
    drafts.push({ crossing, isShort: isOnePage && gapFrom === rowTo });
    listOf(leaving, start.node).push(crossing);
  }

  // From the top down: a vertical moved aside in one gap goes on from there into the next.
  const byRow = [...model.nodes].sort((a, b) => placed.rowOf(a) - placed.rowOf(b));
  const starts = new Map<Crossing, number>();
  let row = -1;
  let waiting: MapNode[] = [];
  const settle = (): void => {
    for (const node of waiting) {
      for (const crossing of leaving.get(node) ?? []) {
        const x = node.isList ? (entries.get(node) ?? 0) : slot(node, crossing.family);
        starts.set(crossing, x);
        const { gapFrom } = routes.get(crossing) as { gapFrom: number };
        if (gapFrom > placed.rowOf(node)) {
          fromAbove.set(place(node.page, gapFrom, x), crossing.family);
        }
      }
    }
    waiting = [];
  };
  for (const node of byRow) {
    if (placed.rowOf(node) !== row) settle();
    row = placed.rowOf(node);
    const x = placed.x(node) + (node.isList ? -tick : axis);
    const family = familyOf.get(node);
    entries.set(node, family === undefined ? x : clear(node.page, row, x, family));
    waiting.push(node);
  }
  settle();

  const wires = drafts.map(({ crossing, isShort }): Wire => {
    const start = spots.get(crossing.reference) as { node: MapNode; row: number };
    const end = spots.get(crossing.to) as { node: MapNode; row: number };
    const { gapFrom, gapTo } = routes.get(crossing) as { gapFrom: number; gapTo: number };
    const x = clear(end.node.page, gapTo, slot(end.node, crossing.family), crossing.family);
    return {
      crossing,
      isShort,
      from: { ...start, x: starts.get(crossing) ?? 0, gap: gapFrom },
      to: { ...end, x, gap: gapTo },
    };
  });

  for (const { from, to, family } of model.links) {
    const track = trackAt(to.node.page, placed.rowOf(to.node));
    track.touch(family, exitX(from, placed, metrics));
    track.touch(family, entries.get(to.node) ?? 0);
  }
  for (const { crossing, from, to, isShort } of wires) {
    const { family } = crossing;
    trackAt(from.node.page, from.gap).touch(family, from.x);
    trackAt(to.node.page, to.gap).touch(family, to.x);
    if (isShort) continue;
    // Which side it leaves the page on is not known yet.
    for (const { node, gap } of [from, to]) {
      trackAt(node.page, gap).touch(family, -far);
      trackAt(node.page, gap).touch(family, far);
    }
  }
  const gaps = tracks.map((page, i) =>
    page.map((track, gap) => {
      const count = track.lay();
      const isInner = gap > 0 && gap < (placed.pages[i]?.rowHeights.length ?? 0);
      const least = isInner ? metrics.rows : metrics.padY;
      return Math.max(least, count === 0 ? 0 : (count + 3) * step);
    }),
  );
  return { gaps, tracks, entry: (node) => entries.get(node) ?? 0, wires };
}

type Spot = { node: MapNode; row: number };

/** Where a family leaves its couple: under the last row, on the right of any other. */
function exitX({ node, row }: Spot, placed: Placed, { w, axis, step }: MapMetrics): number {
  const index = node.exits.indexOf(row);
  if (index < 0) return placed.x(node) + axis;
  return placed.x(node) + w + step * (node.exits.length - index);
}

export type MapGrid = {
  pages: MapPage[];
  width: number;
  height: number;
  corner: (node: MapNode) => { x: number; y: number };
};

export function drawMapLines(
  model: MapModel,
  {
    placed,
    plan,
    sheets,
    metrics,
  }: { placed: Placed; plan: MapPlan; sheets: Sheets; metrics: MapMetrics },
): { links: Link[]; grid: MapGrid } {
  const { step, line, w } = metrics;
  const { list, perRow } = sheets;
  const sheetOf = (node: MapNode): Sheet => list[node.page] as Sheet;
  const gapTop = (node: MapNode, gap: number): number => {
    const { tops } = sheetOf(node);
    const heights = placed.pages[node.page]?.rowHeights ?? [];
    return gap === 0 ? metrics.head : (tops[gap - 1] ?? 0) + (heights[gap - 1] ?? 0);
  };

  // Which gutters and streets every line takes.
  const columns = Math.min(perRow, list.length);
  const gutters = Array.from({ length: columns + 1 }, () => new Track());
  const rowCount = Math.ceil(list.length / perRow);
  const streets = Array.from({ length: rowCount + 1 }, () => new Track());
  const depth = ({ node, gap }: Wire["from"]): number =>
    sheetOf(node).row * far + gapTop(node, gap);
  const routes = plan.wires.map((wire) => {
    const [a, b] = [sheetOf(wire.from.node), sheetOf(wire.to.node)];
    const isLeft = wire.from.x < (placed.pages[wire.from.node.page]?.width ?? 0) / 2;
    const [first, last] =
      a.column === b.column
        ? isLeft
          ? [a.column, a.column]
          : [a.column + 1, a.column + 1]
        : a.column < b.column
          ? [a.column + 1, b.column]
          : [a.column, b.column + 1];
    const street =
      first === last
        ? null
        : a.row === b.row
          ? a.row === 0
            ? 1
            : a.row
          : Math.max(a.row, b.row);
    return { wire, first, last, street };
  });
  for (const { wire, first, last, street } of routes) {
    if (wire.isShort) continue;
    const { family } = wire.crossing;
    const middle = street === null ? null : street * far - far / 2;
    gutters[first]?.touch(family, depth(wire.from));
    gutters[first]?.touch(family, middle ?? depth(wire.to));
    gutters[last]?.touch(family, middle ?? depth(wire.from));
    gutters[last]?.touch(family, depth(wire.to));
  }
  const strip = (track: Track): { size: number; count: number } => {
    const count = track.lay();
    const size = Math.max(metrics.gutter, (count + 1) * step);
    return { size: Math.ceil(size / step) * step, count };
  };
  const gutterStrips = gutters.map(strip);
  for (const { wire, first, last, street } of routes) {
    if (wire.isShort || street === null) continue;
    const { family } = wire.crossing;
    for (const gutter of [first, last]) {
      const lane = gutters[gutter]?.lane(family) ?? 0;
      streets[street]?.touch(family, gutter * far + lane * step);
    }
  }
  const streetStrips = streets.map(strip);

  const pages = pagesOf(list, { columns, rowCount, gutterStrips, streetStrips, metrics, placed });
  const { boxes, gutterX, streetY, width, height } = pages;
  const corner = (node: MapNode): { x: number; y: number } => {
    const { x, w: full, y } = boxes[node.page] as MapPage;
    const content = placed.pages[node.page]?.width ?? 0;
    const inset = Math.floor((full - content) / 2 / step) * step;
    const top = sheetOf(node).tops[placed.rowOf(node)] ?? 0;
    return { x: x + inset + placed.x(node), y: y + top };
  };
  /** From a place on the contents of a page to one on the map. */
  const onMap = (node: MapNode, x: number): number => corner(node).x - placed.x(node) + x;
  const gapY = (node: MapNode, gap: number, family: string): number => {
    const { tracks, gaps } = plan;
    const track = tracks[node.page]?.[gap] as Track;
    const count = Math.max(1, track.count);
    const size = gaps[node.page]?.[gap] ?? 0;
    const top = (boxes[node.page]?.y ?? 0) + gapTop(node, gap);
    const start = top + (size - (count - 1) * step) / 2 - step;
    // Pages on both sides of a gutter keep half a step apart, so their lines never meet in it.
    const half = (sheetOf(node).column % 2) * (step / 2);
    return Math.ceil(start / step) * step + half + track.lane(family) * step;
  };
  const rowY = ({ node, row }: Spot): number => corner(node).y + (row + 0.5) * line;

  const links: Link[] = model.links.map(({ from, to, ...link }): Link => {
    const { x, y } = corner(from.node);
    const exit = onMap(from.node, exitX(from, placed, metrics));
    const isBelow = !from.node.exits.includes(from.row);
    const points: Point[] = isBelow
      ? [[exit, y + from.node.rows.length * line]]
      : [
          [x + w, rowY(from)],
          [exit, rowY(from)],
        ];
    const entry = onMap(to.node, plan.entry(to.node));
    const child = corner(to.node);
    if (entry !== exit) {
      const lane = gapY(to.node, placed.rowOf(to.node), link.family);
      points.push([exit, lane], [entry, lane]);
    }
    if (to.node.isList) points.push([entry, rowY(to)], [child.x, rowY(to)]);
    else points.push([entry, child.y]);
    return { ...link, points };
  });
  for (const { wire, first, last, street } of routes) {
    const { crossing, from, to, isShort } = wire;
    const { family, reference, certainty } = crossing;
    const [startX, endX] = [onMap(from.node, from.x), onMap(to.node, to.x)];
    const startY = gapY(from.node, from.gap, family);
    const endY = gapY(to.node, to.gap, family);
    const points: Point[] = [
      [corner(from.node).x, rowY(from)],
      [startX, rowY(from)],
      [startX, startY],
    ];
    if (!isShort) {
      const [a, b] = [gutterX(first, gutters, family), gutterX(last, gutters, family)];
      points.push([a, startY]);
      if (street !== null) {
        const y = streetY(street, streets, family);
        points.push([a, y], [b, y]);
      }
      points.push([b, endY]);
    }
    points.push([endX, endY], [endX, rowY(to)], [corner(to.node).x, rowY(to)]);
    links.push({
      type: "reference",
      reference,
      to: [crossing.to],
      family,
      certainty,
      direct: true,
      points,
    });
  }
  for (const union of model.unions) links.push({ ...union, points: [] });
  return { links, grid: { pages: boxes, width, height, corner } };
}

type Strip = { size: number; count: number };

/** The table of pages: columns and rows of one size each, gutters and streets between them. */
function pagesOf(
  list: Sheet[],
  {
    columns,
    rowCount,
    gutterStrips,
    streetStrips,
    metrics,
    placed,
  }: {
    columns: number;
    rowCount: number;
    gutterStrips: Strip[];
    streetStrips: Strip[];
    metrics: MapMetrics;
    placed: Placed;
  },
) {
  const { step } = metrics;
  const widths = Array.from({ length: columns }, () => 0);
  const heights = Array.from({ length: rowCount }, () => 0);
  for (const { row, column, w, h } of list) {
    widths[column] = Math.max(widths[column] ?? 0, w);
    heights[row] = Math.max(heights[row] ?? 0, h);
  }
  const starts = (strips: Strip[], sizes: number[]): { strips: number[]; cells: number[] } => {
    const found = { strips: [] as number[], cells: [] as number[] };
    let at = 0;
    strips.forEach(({ size }, i) => {
      found.strips.push(at);
      at += size;
      found.cells.push(at);
      at += sizes[i] ?? 0;
    });
    return found;
  };
  const across = starts(gutterStrips, widths);
  const down = starts(streetStrips, heights);
  const boxes = list.map(({ branch, people, row, column, tops }, i): MapPage => {
    const [x, y] = [across.cells[column] ?? 0, down.cells[row] ?? 0];
    const [w, h] = [widths[column] ?? 0, heights[row] ?? 0];
    const own = placed.pages[i]?.rowHeights ?? [];
    return {
      branch,
      people,
      x,
      y,
      w,
      h,
      head: { x, y, w, h: metrics.head },
      rows: own.map((height, n) => ({ y: y + (tops[n] ?? 0), h: height })),
    };
  });
  const lane =
    (strips: Strip[], edges: number[]) =>
    (at: number, tracks: Track[], family: string): number => {
      const { size, count } = strips[at] as Strip;
      const inset = (size - (Math.max(1, count) - 1) * step) / 2;
      return (edges[at] ?? 0) + inset + (tracks[at]?.lane(family) ?? 0) * step;
    };
  const last = list.length === 0;
  return {
    boxes,
    gutterX: lane(gutterStrips, across.strips),
    streetY: lane(streetStrips, down.strips),
    width: last ? 0 : (across.cells.at(-1) ?? 0),
    height: last ? 0 : (down.cells.at(-1) ?? 0),
  };
}
