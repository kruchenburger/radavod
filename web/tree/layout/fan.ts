import type { TreeSnapshot } from "../../../src/shared/tree";
import { isOfLine, kinOf, type ParentSet } from "./kin";
import type { CardText, Line, Measure, TextStyle } from "./types";

/** How a ring sets its names: along the arc, or outward along the radius. */
export type FanRing = "along" | "out" | "given";

/** Sizes of the fan, from docs/design.md. */
export type FanMetrics = {
  /** The radius of the middle, where the centre is named. */
  inner: number;
  /** Width of every ring, from the parents outward. */
  rings: number[];
  /** How every ring sets its names. */
  sets: FanRing[];
  /** The least length of a person along the middle of the ring: a target, and room for a name. */
  least: number;
};

export const fanMetrics: Record<"wide" | "narrow", FanMetrics> = {
  wide: {
    inner: 104,
    rings: [58, 112, 112, 112, 70, 70],
    sets: ["along", "out", "out", "out", "given", "given"],
    least: 24,
  },
  narrow: {
    inner: 58,
    rings: [130, 130, 130, 130, 70, 70],
    sets: ["out", "out", "out", "out", "given", "given"],
    // 44 px of the screen at the smallest scale the fan is shown at.
    least: 51,
  },
};

export type FanCell = {
  /** The person and the way to them from the centre, so a person met twice has two keys. */
  key: string;
  person: string;
  /** 1 for the parents of the centre. */
  ring: number;
  /** Angles from the left end of the base line, counter-clockwise: `from` > `to`. */
  from: number;
  to: number;
  inner: number;
  outer: number;
  /** The key of the cell of the child; null when the child stands in the centre. */
  child: string | null;
  direct: boolean;
  /** The person stands nearer the centre already: the cell names them and goes no further. */
  repeat: boolean;
  /** Some ancestors of the person are not drawn: the fan has no more room or rings. */
  further: boolean;
};

export type FanSide = {
  person: string;
  from: number;
  to: number;
  /** A parent of the person is too narrow to draw even at the least. */
  further: boolean;
};

export type Fan = {
  /** One person, or two of a union, each with a half of the fan, or a quarter on the phone. */
  sides: FanSide[];
  cells: FanCell[];
  /** The outer edge of the outermost ring drawn. */
  radius: number;
  metrics: FanMetrics;
};

export type FanOptions = {
  metrics: FanMetrics;
  /** Whose ancestors are the direct line. */
  lineOf?: string | null;
  /** A quarter for one person only: the phone. */
  isQuarter?: boolean;
};

/** A parent nobody knows keeps this share of a place, empty. */
const unknownShare = 0.6;

/**
 * The ancestors of one person or of a couple, outward from the centre. The two of a couple share
 * the half circle, the first on the left; fathers stand on the outer side. A person takes the angle
 * of the known ends of their line, so no room is left for people nobody knows. A person met again
 * is named and goes no further, a person too narrow to read is left out and their child says so.
 */
export function fanOf(snapshot: TreeSnapshot, centre: string[], options: FanOptions): Fan {
  const { metrics, isQuarter = false } = options;
  const kin = kinOf(snapshot);
  const line = kin.lineOf(options.lineOf ?? null);
  const people = centre.filter((id) => kin.person(id) !== undefined).slice(0, 2);
  const parentsOf = (id: string): { parents: string[]; set: ParentSet | null } => {
    const set = kin.sets(id).find(({ known, main }) => main && known.length > 0) ?? null;
    const male = (one: string) => (kin.person(one)?.sex === "male" ? 0 : 1);
    const parents = [...(set?.known ?? [])].sort((a, b) => male(a) - male(b)).slice(0, 2);
    return { parents, set };
  };
  const depth = metrics.rings.length;
  const weights = new Map<string, number>();
  /** The known ends of the line of a person within the rings; a loop in the data ends it. */
  const weight = (id: string, ring: number, path: ReadonlySet<string>): number => {
    const name = `${id} ${ring}`;
    const known = weights.get(name);
    if (known !== undefined) return known;
    if (path.has(id)) return 1;
    const { parents } = ring >= depth ? { parents: [] } : parentsOf(id);
    const inner = new Set(path).add(id);
    const own =
      parents.length === 0
        ? 1
        : parents.reduce((sum, parent) => sum + weight(parent, ring + 1, inner), 0) +
          (parents.length === 1 ? unknownShare : 0);
    weights.set(name, own);
    return own;
  };

  const sides: FanSide[] =
    people.length === 0
      ? []
      : isQuarter
        ? [{ person: people[0] as string, from: Math.PI / 2, to: 0, further: false }]
        : people.length === 1
          ? [{ person: people[0] as string, from: Math.PI, to: 0, further: false }]
          : [
              { person: people[0] as string, from: Math.PI, to: Math.PI / 2, further: false },
              { person: people[1] as string, from: Math.PI / 2, to: 0, further: false },
            ];
  const ringIn = (ring: number): number =>
    metrics.inner + metrics.rings.slice(0, ring - 1).reduce((sum, width) => sum + width, 0);
  const ringOut = (ring: number): number => ringIn(ring) + (metrics.rings[ring - 1] ?? 0);

  // Ring by ring, so that a person met twice stands in full where they are nearer the centre.
  type Step = {
    id: string;
    span: { from: number; to: number };
    ring: number;
    child: FanCell | null;
    side: FanSide;
  };
  const cells: FanCell[] = [];
  const seen = new Set<string>(sides.map(({ person }) => person));
  const queue: Step[] = sides.map((side) => ({
    id: side.person,
    span: side,
    ring: 1,
    child: null,
    side,
  }));
  const further = ({ child, side }: Step): void => {
    if (child === null) side.further = true;
    else child.further = true;
  };
  for (const step of queue) {
    const { id, span, ring, child } = step;
    const { parents, set } = parentsOf(id);
    if (parents.length === 0) continue;
    if (ring > depth) {
      further(step);
      continue;
    }
    const middle = (ringIn(ring) + ringOut(ring)) / 2;
    const shares = sharesOf(
      parents.map((parent) => weight(parent, ring, new Set([id]))),
      parents.length === 1 ? unknownShare : 0,
      { span: span.from - span.to, least: metrics.least / middle },
    );
    let at = span.from;
    parents.forEach((parent, i) => {
      const share = shares[i] ?? 0;
      const own = { from: at, to: at - share };
      at -= share;
      if (share * middle < metrics.least - 1e-9) {
        further(step);
        return;
      }
      const repeat = seen.has(parent);
      seen.add(parent);
      const cell: FanCell = {
        key: `${child?.key ?? id}/${parent}`,
        person: parent,
        ring,
        ...own,
        inner: ringIn(ring),
        outer: ringOut(ring),
        child: child?.key ?? null,
        direct: set !== null && isOfLine(set) && line.has(id),
        repeat,
        further: false,
      };
      cells.push(cell);
      if (!repeat)
        queue.push({ id: parent, span: own, ring: ring + 1, child: cell, side: step.side });
    });
  }
  const drawn = Math.max(0, ...cells.map(({ ring }) => ring));
  return { sides, cells, radius: drawn === 0 ? metrics.inner : ringOut(drawn), metrics };
}

/**
 * Angles of the parents by the ends of their lines. A parent narrower than the least gets the
 * least, taken from the others and from the place of a parent nobody knows, when the span holds it;
 * when it does not, the shares stay as the weights say and the narrow ones are left out.
 */
export function sharesOf(
  weights: number[],
  unknown: number,
  { span, least }: { span: number; least: number },
): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0) + unknown;
  const plain = weights.map((weight) => (span * weight) / total);
  if (least * weights.length > span) return plain;
  const short = plain.reduce((sum, share) => sum + Math.max(0, least - share), 0);
  if (short === 0) return plain;
  // Room given back by every place in proportion to what it has above the least; the unknown has
  // no least of its own.
  const spare = [...plain.map((share) => Math.max(0, share - least)), (span * unknown) / total];
  const room = spare.reduce((sum, one) => sum + one, 0);
  if (room < short) return plain;
  return plain.map((share, i) =>
    share < least ? least : share - (short * (spare[i] ?? 0)) / room,
  );
}

/** Lines of the text of a cell, counted across the ring from its middle. */
export type FanLine = Pick<Line, "text" | "part" | "style" | "w"> & { dy: number };

const lineHeight = 17;

/** Years are set at 16 px, so that at the smallest scale of the fan they are still 14. */
const yearsStyle: TextStyle = "focusDetail";

/** The smallest scale the fan is shown at: names of 17 px and years of 16 stay at 14 or more. */
export const leastScale = 14 / 16;

/**
 * The words of a cell in the first form that fits it: along the arc the name, the surname under
 * it and the years; outward the name and the years, the name on two lines, the name alone, the
 * given name with the first letter of the surname, the given name. Nothing that does not fit.
 */
export function fanText(
  cell: FanCell,
  text: CardText,
  { measure, sets }: { measure: Measure; sets: FanRing[] },
): FanLine[] {
  const style: TextStyle = cell.direct ? "nameDirect" : "name";
  const set = sets[cell.ring - 1] ?? "given";
  const length = cell.outer - cell.inner - 16;
  const across = (cell.from - cell.to) * (cell.inner + 10);
  const { given, surname, years } = text;
  const whole = `${given} ${surname}`.trim();
  const width = (value: string, own: TextStyle = style): number => measure(value, own);
  const lines = (...rows: [string, FanLine["part"], TextStyle][]): FanLine[] =>
    rows.map(([value, part, own], i) => ({
      text: value,
      part,
      style: own,
      w: width(value, own),
      dy: (i - (rows.length - 1) / 2) * lineHeight,
    }));
  if (set === "along") {
    // Straight lines across the ring: the narrowest is the chord at its inner edge.
    const arc = (cell.from - cell.to) * (cell.inner + 4) - 12;
    const room = cell.outer - cell.inner - 6;
    const isYears = width(years, yearsStyle) <= arc;
    if (isYears && width(whole) <= arc && room >= 2 * lineHeight) {
      return lines([whole, "given", style], [years, "years", yearsStyle]);
    }
    const fit = [given, surname].every((part) => width(part) <= arc);
    if (isYears && fit && room >= 3 * lineHeight) {
      return lines(
        [given, "given", style],
        [surname, "surname", style],
        [years, "years", yearsStyle],
      );
    }
    if (fit && room >= 2 * lineHeight) {
      return lines([given, "given", style], [surname, "surname", style]);
    }
    return width(given) <= arc ? lines([given, "given", style]) : [];
  }
  const fits = (value: string): boolean => width(value) <= length;
  if (set === "out") {
    if (across >= 2 * lineHeight + 4 && fits(whole) && width(years, yearsStyle) <= length) {
      return lines([whole, "given", style], [years, "years", yearsStyle]);
    }
    if (across >= 2 * lineHeight + 4 && fits(given) && fits(surname)) {
      return lines([given, "given", style], [surname, "surname", style]);
    }
    if (across >= lineHeight - 3 && fits(whole)) return lines([whole, "given", style]);
    const short = surname === "" ? given : `${given} ${[...surname][0]}.`;
    if (across >= lineHeight - 3 && fits(short)) return lines([short, "given", style]);
  }
  return across >= lineHeight - 3 && fits(given) ? lines([given, "given", style]) : [];
}

export type FanArrow = "up" | "down" | "left" | "right";

/**
 * Keys on the fan: up to a parent, the one on the direct line first, else the father; down to the
 * child; left and right along the ring, in the order of the angle.
 */
export function fanKeys({ cells }: Fan): (key: string, arrow: FanArrow) => string | null {
  const byKey = new Map(cells.map((cell) => [cell.key, cell]));
  const rings = new Map<number, FanCell[]>();
  for (const cell of cells) rings.set(cell.ring, [...(rings.get(cell.ring) ?? []), cell]);
  for (const ring of rings.values()) ring.sort((a, b) => b.from - a.from);
  return (key, arrow) => {
    const cell = byKey.get(key);
    if (cell === undefined) return null;
    if (arrow === "down") return cell.child;
    if (arrow === "up") {
      const parents = cells.filter(({ child }) => child === key);
      return (parents.find(({ direct }) => direct) ?? parents[0])?.key ?? null;
    }
    const ring = rings.get(cell.ring) ?? [];
    const at = ring.indexOf(cell) + (arrow === "left" ? -1 : 1);
    return ring[at]?.key ?? null;
  };
}

/** The first cell for the keys: the direct line first, else the first on the left. */
export const firstCell = ({ cells }: Fan): FanCell | undefined =>
  cells.find(({ ring, direct }) => ring === 1 && direct) ?? cells.find(({ ring }) => ring === 1);
