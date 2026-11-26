import type { Link, ParentageLink, Point } from "./layout/types";

export type LineKind = "thin" | "adopted" | "version" | "direct" | "reference";

/** A shape for every kind of line, so that none depends on a color. */
export function lineKind(link: Link): LineKind {
  if (link.type === "reference") return link.direct ? "direct" : "reference";
  if (link.type === "union") return link.direct ? "direct" : "thin";
  return tieKind(link);
}

/** The kind of the line from parents to a child. */
export function tieKind({
  direct,
  main,
  kind,
}: Pick<ParentageLink, "direct" | "main" | "kind">): LineKind {
  if (direct) return "direct";
  if (!main) return "version";
  return kind === "adoption" || kind === "guardianship" ? "adopted" : "thin";
}

/** How a line looks, in SVG and on the canvas alike. */
export const lineLooks: Record<LineKind, { width: number; dash: number[] }> = {
  thin: { width: 1.1, dash: [] },
  reference: { width: 1.1, dash: [] },
  version: { width: 1.4, dash: [1.4, 3.6] },
  adopted: { width: 1.8, dash: [5, 4] },
  direct: { width: 2.6, dash: [] },
};

/** The order of drawing: the direct line lies over its neighbours. */
export const lineOrder: Record<LineKind, number> = {
  version: 0,
  adopted: 1,
  thin: 2,
  reference: 2,
  direct: 3,
};

/** What a line is drawn with: a path of SVG or a canvas. */
export type Pen = {
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => void;
};

/** The most a corner takes along a horizontal and along a vertical piece. */
export type Corners = { across: number; down: number };

/**
 * Pieces along the axes with rounded corners. Two lines that share the middle of their gap make the
 * brace of docs/design.md, with the tip where they meet.
 */
export function drawLine(points: readonly Point[], corners: Corners, pen: Pen): void {
  const path = withoutRepeats(points);
  const first = path[0];
  if (first === undefined) return;
  pen.moveTo(...first);
  let here = first;
  const go = (to: Point): void => {
    if (to[0] !== here[0] || to[1] !== here[1]) pen.lineTo(...to);
  };
  for (let i = 1; i < path.length - 1; i += 1) {
    const [before, at, after] = [path[i - 1], path[i], path[i + 1]] as [Point, Point, Point];
    // A piece between two corners is shared, the first and the last one belong to one corner.
    const a = towards(at, before, i > 1, corners);
    const b = towards(at, after, i < path.length - 2, corners);
    go(a);
    pen.quadraticCurveTo(...at, ...b);
    here = b;
  }
  const last = path.at(-1);
  if (last !== undefined) go(last);
}

export function linePath(points: readonly Point[], corners: Corners): string {
  const parts: string[] = [];
  drawLine(points, corners, {
    moveTo: (x, y) => parts.push(`M${x} ${y}`),
    lineTo: (x, y) => parts.push(`L${x} ${y}`),
    quadraticCurveTo: (cx, cy, x, y) => parts.push(`Q${cx} ${cy} ${x} ${y}`),
  });
  return parts.join("");
}

function towards(from: Point, to: Point, isShared: boolean, corners: Corners): Point {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.abs(dx) + Math.abs(dy);
  if (length === 0) return from;
  const most = dx === 0 ? corners.down : corners.across;
  const part = Math.min(most, isShared ? length / 2 : length) / length;
  return [from[0] + dx * part, from[1] + dy * part];
}

/** Without points that repeat, and those in the middle of a straight piece. */
function withoutRepeats(points: readonly Point[]): Point[] {
  const path: Point[] = [];
  for (const point of points) {
    const last = path.at(-1);
    const before = path.at(-2);
    if (last !== undefined && last[0] === point[0] && last[1] === point[1]) continue;
    const isStraight =
      last !== undefined &&
      before !== undefined &&
      ((before[0] === last[0] && last[0] === point[0]) ||
        (before[1] === last[1] && last[1] === point[1]));
    if (isStraight) path.pop();
    path.push(point);
  }
  return path;
}
