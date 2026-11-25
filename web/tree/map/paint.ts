import type { BranchMap, MapCard } from "../layout/branch-map";
import { type LineKind, lineKind, lineOrder, linePath } from "../line-path";
import { pointAt, type Size, type View } from "./view";

/** What the canvas of the map is drawn with. */
export type Paint = {
  surface: string;
  ink: string;
  rule: string;
  /** The ink of the bar of a person, or of the outline of a reference. */
  inkOf: (card: MapCard) => string;
};

type Box = { x0: number; y0: number; x1: number; y1: number };
type Stroke = { kind: LineKind; box: Box; path: Path2D };
type Bars = { ink: string; box: Box; path: Path2D; isHollow: boolean };

/** Everything of one level, in pieces small enough to leave out what the window does not show. */
export type Drawing = { map: BranchMap; strokes: Stroke[]; joins: Stroke[]; bars: Bars[] };

const widths: Record<LineKind | "join", number> = {
  thin: 1.1,
  reference: 1.1,
  version: 1.4,
  adopted: 1.8,
  direct: 3,
  join: 1.2,
};
const dashes: Partial<Record<LineKind, number[]>> = { adopted: [5, 4], version: [1.4, 3.6] };

/** Prepares what does not change while the map moves. `barOf` is the length of a bar from far. */
export function drawingOf(
  map: BranchMap,
  { inkOf }: Pick<Paint, "inkOf">,
  barOf: ((card: MapCard) => number) | null,
): Drawing {
  const { step } = map.metrics;
  const corners = { across: step, down: step };
  const pages = new Map(map.cards.map(({ key, page }) => [key, page]));
  const strokes = new Map<string, Stroke>();
  for (const link of map.links) {
    if (link.points.length < 2) continue;
    const kind = lineKind(link);
    // Lines of one page go together; a line between pages is a piece of its own.
    const page = link.type === "parentage" ? pages.get(link.childAt ?? link.child) : undefined;
    const isWithin =
      link.type === "parentage" &&
      link.parents.every((parent) => pages.get(link.parentsAt ?? parent) === page);
    const name = isWithin ? `${kind} ${page}` : `${kind} ${strokes.size} alone`;
    const stroke = strokes.get(name) ?? { kind, box: none(), path: new Path2D() };
    stroke.path.addPath(new Path2D(linePath(link.points, corners)));
    for (const [x, y] of link.points) grow(stroke.box, x, y);
    strokes.set(name, stroke);
  }
  const joins = map.joins.map(({ x, y, h }): Stroke => {
    const path = new Path2D();
    path.moveTo(x, y);
    path.lineTo(x, y + h);
    return { kind: "thin", box: { x0: x, y0: y, x1: x, y1: y + h }, path };
  });
  const bars = new Map<string, Bars>();
  for (const card of barOf === null ? [] : map.cards) {
    const ink = inkOf(card);
    const isHollow = card.reference !== undefined;
    const name = `${card.page} ${isHollow} ${ink}`;
    const bar = bars.get(name) ?? { ink, isHollow, box: none(), path: new Path2D() };
    const w = barOf?.(card) ?? card.w;
    const inset = card.h * 0.18;
    bar.path.rect(card.x, card.y + inset, w, card.h - 2 * inset);
    grow(bar.box, card.x, card.y);
    grow(bar.box, card.x + w, card.y + card.h);
    bars.set(name, bar);
  }
  return {
    map,
    strokes: [...strokes.values()].sort((a, b) => lineOrder[a.kind] - lineOrder[b.kind]),
    joins,
    bars: [...bars.values()],
  };
}

type Brush = Pick<
  CanvasRenderingContext2D,
  | "setTransform"
  | "clearRect"
  | "fillRect"
  | "fill"
  | "stroke"
  | "setLineDash"
  | "lineWidth"
  | "lineJoin"
  | "strokeStyle"
  | "fillStyle"
>;

/** Draws what the window shows. `unit` is how many dots of the screen one unit of the map takes. */
export function paint(
  brush: Brush,
  { map, strokes, joins, bars }: Drawing,
  { view, window, unit, colors }: { view: View; window: Size; unit: number; colors: Paint },
): void {
  const [left, top] = pointAt(view, window, 0, 0);
  const [right, bottom] = pointAt(view, window, window.w, window.h);
  const isSeen = ({ x0, y0, x1, y1 }: Box): boolean =>
    x0 <= right + 4 && x1 >= left - 4 && y0 <= bottom + 4 && y1 >= top - 4;
  const scale = view.k * unit;
  brush.setTransform(1, 0, 0, 1, 0, 0);
  brush.clearRect(0, 0, Math.ceil(window.w * unit), Math.ceil(window.h * unit));
  brush.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);

  brush.fillStyle = colors.surface;
  for (const { x, y, w, h } of map.pages) {
    if (isSeen({ x0: x, y0: y, x1: x + w, y1: y + h })) brush.fillRect(x, y, w, h);
  }
  // Lines keep their width, however large the map is.
  const thickness = map.level === "far" ? 0.75 : 1;
  brush.lineJoin = "round";
  const draw = ({ path, kind }: Stroke, width: number): void => {
    brush.lineWidth = (width * thickness) / view.k;
    brush.strokeStyle = kind === "direct" ? colors.ink : colors.rule;
    brush.setLineDash((dashes[kind] ?? []).map((dash) => (dash * thickness) / view.k));
    brush.stroke(path);
  };
  for (const stroke of strokes) if (isSeen(stroke.box)) draw(stroke, widths[stroke.kind]);
  for (const join of joins) if (isSeen(join.box)) draw(join, widths.join);
  brush.setLineDash([]);
  for (const { ink, path, box, isHollow } of bars) {
    if (!isSeen(box)) continue;
    if (isHollow) {
      brush.strokeStyle = ink;
      brush.lineWidth = 0.9 / view.k;
      brush.stroke(path);
    } else {
      brush.fillStyle = ink;
      brush.fill(path);
    }
  }
}

const none = (): Box => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

function grow(box: Box, x: number, y: number): void {
  box.x0 = Math.min(box.x0, x);
  box.y0 = Math.min(box.y0, y);
  box.x1 = Math.max(box.x1, x);
  box.y1 = Math.max(box.y1, y);
}
