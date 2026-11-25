import type { Row, Rows } from "./around";
import type { Model } from "./around-model";
import type { AroundMetrics } from "./around-text";
import { listOf } from "./kin";
import { inPlace, outPlace, spread, step, Track } from "./lanes";
import type { Link, Point } from "./types";

/** An end of a line on a side of a card. A gutter has the number of the column on its left. */
type Pin = { key: string; y: number; gutter: number };

/** A line from pin to pin through gutters, crossing from one to the next at a height of its own. */
type Wire = { link: Link; family: string; from: Pin; to: Pin; gutters: number[]; passes: number[] };

type Column = { generation: number; x: number; w: number };

export function drawLines(
  model: Model,
  rows: Rows,
  metrics: AroundMetrics,
): { links: Link[]; columns: Column[]; width: number; height: number; shift: number } {
  const generations = [...model.entries.values()].map(({ generation }) => generation);
  const [first, last] = [Math.min(...generations), Math.max(...generations)];
  const wires = wiresOf(model, rows, { metrics, margin: first - 1 });
  straighten(wires);
  const passes = findPasses(wires, model, rows);

  const tracks = new Map<number, Track>();
  const trackAt = (gutter: number): Track => {
    let track = tracks.get(gutter);
    if (track === undefined) tracks.set(gutter, (track = new Track()));
    return track;
  };
  for (const { family, from, to, gutters, passes: own } of wires) {
    gutters.forEach((gutter, i) => {
      trackAt(gutter).touch(family, own[i - 1] ?? from.y);
      trackAt(gutter).touch(family, own[i] ?? to.y);
    });
  }
  // Every union of the person has a lane of its own, so nobody wonders whose child it is.
  const own = new Set(
    wires.flatMap(({ link, family, from }) =>
      link.type === "parentage" && link.tree && from.gutter === 0 ? [family] : [],
    ),
  );
  if (own.size > 1) for (const family of own) trackAt(0).touch(family, metrics.anchor);

  const columns: Column[] = [];
  const gutters = new Map<number, { x: number; w: number; count: number }>();
  let x = 0;
  for (let at = first - 1; at <= last; at += 1) {
    if (at >= first) {
      const w = at === 0 ? metrics.strip : metrics.column;
      columns.push({ generation: at, x, w });
      x += w;
    }
    const count = tracks.get(at)?.lay() ?? 0;
    const isOuter = at < first || at === last;
    const w = isOuter && count === 0 ? 0 : Math.max(metrics.gap, (count + 1) * metrics.lane);
    gutters.set(at, { x, w, count });
    x += w;
  }
  const laneX = (at: number, family: string): number => {
    const { x: left, w, count } = gutters.get(at) as { x: number; w: number; count: number };
    return left + (w * ((tracks.get(at)?.lane(family) ?? 0) + 1)) / (Math.max(count, 1) + 1);
  };
  const sideX = ({ key, gutter }: Pin): number => {
    const generation = model.entries.get(key)?.generation ?? 0;
    const column = columns[generation - first] as Column;
    return gutter === generation ? column.x + column.w : column.x;
  };

  const ys = [...rows.values()].flatMap(({ y, h }) => [y, y + h]);
  const shift = -Math.floor(Math.min(...ys, ...passes) / step) * step;
  for (const { link, family, from, to, gutters: through, passes: own } of wires) {
    const path: Point[] = [[sideX(from), from.y]];
    const isStraight = from.y === to.y && through.length === 1 && sideX(from) !== sideX(to);
    if (!isStraight) {
      through.forEach((gutter, i) => {
        const lane = laneX(gutter, family);
        path.push([lane, own[i - 1] ?? from.y], [lane, own[i] ?? to.y]);
      });
    }
    path.push([sideX(to), to.y]);
    link.points = path.map(([px, py]): Point => [px, py + shift]);
  }
  const links = wires.map(({ link }) => link);
  for (const { isTogether, ...union } of model.unions) {
    if (isTogether) links.push({ ...union, points: [] });
  }
  return { links, columns, width: x, height: Math.max(...ys, ...passes) + shift, shift };
}

type Draft = {
  link: Link;
  family: string;
  from: { key: string; side: Side; below?: string };
  to: { key: string; side: Side };
  isByMargin: boolean;
};
type Side = "right" | "left";

/** Every line with its ends on the sides of cards. */
function wiresOf(
  model: Model,
  rows: Rows,
  { metrics, margin }: { metrics: AroundMetrics; margin: number },
): Wire[] {
  const drafts: Draft[] = [];
  for (const { from, ...link } of model.links) {
    const [key = "", below] = from;
    drafts.push({
      link: { ...link, points: [] },
      family: link.family,
      from: below === undefined ? { key, side: "right" } : { key, side: "right", below },
      to: { key: link.child, side: "left" },
      isByMargin: false,
    });
  }
  for (const { isTogether, ...union } of model.unions) {
    if (isTogether) continue;
    const [a, b] = union.partners;
    drafts.push({
      link: { ...union, points: [] },
      family: union.family,
      from: { key: a, side: "right" },
      to: { key: b, side: "right" },
      isByMargin: false,
    });
  }
  for (const reference of model.references) {
    drafts.push({
      link: { ...reference, points: [] },
      family: reference.family,
      from: { key: reference.reference, side: "left" },
      to: { key: reference.to[0] ?? "", side: "left" },
      isByMargin: true,
    });
  }

  const middleOf = (key: string): number => {
    const { y, h } = rows.get(key) as Row;
    return key === model.focus.key ? y + metrics.anchor : y + h / 2;
  };
  const generationOf = (key: string): number => model.entries.get(key)?.generation ?? 0;

  // Families on one side of a card lie in the order of what they lead to.
  const families = new Map<string, Map<string, number[]>>();
  const note = (key: string, side: Side, family: string, other: string): void => {
    const name = `${side} ${key}`;
    let own = families.get(name);
    if (own === undefined) families.set(name, (own = new Map()));
    listOf(own, family).push(middleOf(other));
  };
  for (const { from, to, family } of drafts) {
    if (from.below === undefined) note(from.key, from.side, family, to.key);
    note(to.key, to.side, family, from.key);
  }
  const places = new Map<string, number>();
  for (const [name, own] of families) {
    const aims = [...own].map(([family, ys]) => ({
      family,
      aim: ys.reduce((sum, y) => sum + y, 0) / ys.length,
    }));
    aims.sort((a, b) => a.aim - b.aim);
    const key = name.slice(name.indexOf(" ") + 1);
    const middle = (name.startsWith("right") ? outPlace : inPlace)(middleOf(key));
    spread(middle, aims.length).forEach((y, i) => {
      places.set(`${name} ${aims[i]?.family}`, y);
    });
  }
  const pin = ({ key, side, below }: Draft["from"], family: string): Pin => {
    const generation = generationOf(key);
    const gutter = side === "right" ? generation : generation - 1;
    if (below === undefined) {
      return { key, y: places.get(`${side} ${key} ${family}`) ?? middleOf(key), gutter };
    }
    // Between the two cards of a couple.
    const { y, h } = rows.get(key) as Row;
    return { key, y: outPlace((y + h + (rows.get(below) as Row).y) / 2), gutter };
  };

  return drafts.map(({ link, family, from, to, isByMargin }) => {
    const [start, end] = [pin(from, family), pin(to, family)];
    const all = isByMargin ? [start.gutter, margin, end.gutter] : [start.gutter, end.gutter];
    const gutters = all.filter((gutter, i) => gutter !== all[i - 1]);
    return { link, family, from: start, to: end, gutters, passes: [] };
  });
}

/** A lone line between two cards almost side by side loses its tiny step. */
function straighten(wires: Wire[]): void {
  const byFamily = new Map<string, Wire[]>();
  for (const wire of wires) listOf(byFamily, wire.family).push(wire);
  for (const [wire, ...rest] of byFamily.values()) {
    if (wire === undefined || rest.length > 0) continue;
    const { link, from, to, gutters } = wire;
    const isShort = gutters.length === 1 && Math.abs(from.y - to.y) < step;
    if (link.type === "parentage" && isShort && from.key !== to.key) to.y = from.y;
  }
}

/**
 * Lines between gutters cross the columns between them at a height where those have no card, or
 * over or under everything.
 */
function findPasses(wires: Wire[], model: Model, rows: Rows): number[] {
  const columns = new Map<number, Row[]>();
  for (const { key, generation } of model.entries.values()) {
    listOf(columns, generation).push(rows.get(key) as Row);
  }
  const pins = wires.flatMap(({ family, from, to }) => [
    { family, ...from },
    { family, ...to },
  ]);
  const all = [...rows.values()];
  const top = Math.min(...all.map(({ y }) => y)) - 2 * step;
  const bottom = Math.max(...all.map(({ y, h }) => y + h)) + 2 * step;
  const taken: { y: number; from: number; to: number; family: string }[] = [];

  for (const { family, from, to, gutters, passes } of wires) {
    for (let i = 1; i < gutters.length; i += 1) {
      const [a, b] = [gutters[i - 1] as number, gutters[i] as number];
      const [left, right] = [Math.min(a, b), Math.max(a, b)];
      const cards: Row[] = [];
      for (let at = left + 1; at <= right; at += 1) cards.push(...(columns.get(at) ?? []));
      // Its own family keeps apart too: another line of it may cross the same columns.
      const nearPins = pins.filter(
        (pin) => pin.family !== family && pin.gutter >= left && pin.gutter <= right,
      );
      const nearPasses = taken.filter((pass) => pass.from <= right && pass.to >= left);
      const isFree = (y: number): boolean =>
        cards.every((card) => y < card.y - 4 || y > card.y + card.h + 4) &&
        nearPins.every((pin) => Math.abs(pin.y - y) >= 3) &&
        nearPasses.every((pass) => Math.abs(pass.y - y) >= 6);
      const wish = gutters.length === 2 ? (from.y + to.y) / 2 : i === 1 ? from.y : to.y;
      // Just past the cards, then further and further out: one of these is always free.
      const candidates = cards.flatMap((card) => [card.y - 6, card.y + card.h + 6]);
      candidates.push(wish, from.y, to.y);
      for (let n = 0; n <= nearPins.length + 2 * nearPasses.length; n += 1) {
        candidates.push(top - n * step, bottom + n * step);
      }
      candidates.sort((p, q) => Math.abs(p - wish) - Math.abs(q - wish));
      const y = candidates.find(isFree) ?? top;
      passes.push(y);
      taken.push({ y, from: left, to: right, family });
    }
  }
  return taken.map(({ y }) => y);
}
