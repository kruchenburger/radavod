import { useLanguage } from "../app/language";
import type { Link, Point } from "./layout/types";
import { type Corners, type LineKind, lineKind, lineOrder, linePath } from "./line-path";
import classes from "./lines.module.css";
import { rem } from "./type";

type LinesProps = {
  links: Link[];
  width: number;
  height: number;
  corners: Corners;
  /** How much longer the line to a card is than the layout has it: to stop by the text. */
  reach?: (card: string) => number;
};

/** The lines of a layout, the direct one above the rest. */
export function Lines({ links, width, height, corners, reach = () => 0 }: LinesProps) {
  const drawn = links
    .filter(({ points }) => points.length > 1)
    .map((link) => {
      let { points } = link;
      if (link.type === "parentage") points = lengthen(points, reach(link.child));
      if (link.type === "reference") points = lengthen(points, -gap);
      // A line that leaves before a name leaves it some room.
      if (link.type !== "union" && leavesLeft(points)) points = back(lengthen(back(points), -gap));
      return { kind: lineKind(link), d: linePath(points, corners) };
    })
    .sort((a, b) => lineOrder[a.kind] - lineOrder[b.kind]);
  return (
    <svg
      className={classes.lines}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: rem(width), height: rem(height) }}
      aria-hidden="true"
      data-late
    >
      {drawn.map(({ kind, d }, i) => (
        <path key={i} className={classes[kind]} d={d} />
      ))}
    </svg>
  );
}

/** A reference and what it names have this much room before their texts. */
const gap = 5;
const leavesLeft = ([first, second]: Point[]): boolean =>
  first !== undefined && second !== undefined && second[0] < first[0];
const back = (points: Point[]): Point[] => [...points].reverse();

/** Moves the end of a line that comes in across. */
function lengthen(points: Point[], by: number): Point[] {
  const [last, before] = [points.at(-1), points.at(-2)];
  if (last === undefined || before === undefined || last[1] !== before[1]) return points;
  // It never turns back on itself.
  const x = last[0] + (before[0] <= last[0] ? Math.max(by, before[0] - last[0]) : 0);
  return [...points.slice(0, -1), [x, last[1]]];
}

const named = { direct: "tree.direct", adopted: "tree.adoption", version: "tree.version" } as const;
const explained = ["direct", "adopted", "version"] as const;

/** Explains the lines that are on the screen and no others. */
export function Legend({ links }: { links: Link[] }) {
  const { t } = useLanguage();
  const kinds = new Set<LineKind>(links.map(lineKind));
  return explained
    .filter((kind) => kinds.has(kind))
    .map((kind) => (
      <span key={kind} className={classes.legend}>
        <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
          <path className={classes[kind]} d="M0 5H26" />
        </svg>
        {t(named[kind])}
      </span>
    ));
}
