import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  type DownNode,
  type Entry,
  type Model,
  modelOf,
  type Reach,
  type Role,
  type UpNode,
} from "./around-model";
import { type AroundMetrics, aroundMetrics, textOfEntry } from "./around-text";
import { kinOf, listOf } from "./kin";
import { inPlace, outPlace, spread, step, Track } from "./lanes";
import type { Box, Card, Layout, Line, Link, Measure, Point, UnknownPlace, Wording } from "./types";

export type AroundOptions = Reach & {
  measure: Measure;
  wording: Wording;
  metrics?: Partial<AroundMetrics>;
};

export type AroundCard = Card & {
  role: Role;
  /** Below zero for ancestors, above for descendants. */
  generation: number;
  lines: Line[];
  unknown?: UnknownPlace;
};

export type AroundLayout = Omit<Layout, "cards"> & {
  cards: AroundCard[];
  focus: string | null;
  columns: { generation: number; x: number; w: number }[];
  /** Siblings by age, folded or not. */
  siblings: string[];
};

/**
 * Ancestors to the left, descendants to the right, the person with all partners in the middle.
 * Somebody who belongs to several places stands once, in the nearest generation, and lines lead
 * there from the others. Lines turn only in the gutters between columns and cross a column only
 * where it has no card.
 */
export function around(
  snapshot: TreeSnapshot,
  focus: string,
  options: AroundOptions,
): AroundLayout {
  const model = modelOf(snapshot, focus, options);
  if (model === null) return emptyAround();
  const metrics = { ...aroundMetrics, ...options.metrics };
  const texts = textsOf(snapshot, model, options, metrics);
  const boxes = placeRows(model, texts, metrics);
  const { links, columns, width, height, shift } = drawLines(model, boxes, metrics);

  const xOf = new Map(columns.map(({ generation, x, w }) => [generation, { x, w }]));
  const cards = [...model.entries.values()].map((entry): AroundCard => {
    const { key, person, unknown, role, generation, direct } = entry;
    const { y, h } = boxes.get(key) as Box;
    const { x, w } = xOf.get(generation) as { x: number; w: number };
    const lines = texts.get(key)?.lines ?? [];
    const card = { key, person, role, generation, direct, lines, x, y: y + shift, w, h };
    return unknown === undefined ? card : { ...card, unknown };
  });
  return {
    cards,
    links,
    columns,
    width,
    height,
    focus: model.focus.key,
    siblings: model.siblingIds,
    order: readingOrder(model),
  };
}

export const emptyAround = (): AroundLayout => ({
  cards: [],
  links: [],
  columns: [],
  width: 0,
  height: 0,
  focus: null,
  siblings: [],
  order: [],
});

export type EntryText = { lines: Line[]; h: number };

/** Texts of all cards. Their heights leave room for every line that comes to the card. */
export function textsOf(
  snapshot: TreeSnapshot,
  model: Model,
  { measure, wording }: AroundOptions,
  metrics: AroundMetrics,
): Map<string, EntryText> {
  const kin = kinOf(snapshot);
  const ports = portsOf(model);
  const texts = new Map<string, EntryText>();
  for (const entry of model.entries.values()) {
    const { lines, h } = textOfEntry(entry, kin, { measure, wording, metrics });
    const most = Math.max(ports.out.get(entry.key)?.size ?? 0, ports.in.get(entry.key)?.size ?? 0);
    texts.set(entry.key, { lines, h: Math.max(h, (most + 2) * step) });
  }
  return texts;
}

type Ports = { out: Map<string, Set<string>>; in: Map<string, Set<string>> };

/** Families whose lines leave and enter each card on a place of its own. */
function portsOf({ links, unions }: Model): Ports {
  const ports: Ports = { out: new Map(), in: new Map() };
  const add = (side: Map<string, Set<string>>, key: string, family: string): void => {
    const families = side.get(key);
    if (families === undefined) side.set(key, new Set([family]));
    else families.add(family);
  };
  for (const { from, child, family } of links) {
    if (from.length === 1) add(ports.out, from[0] as string, family);
    add(ports.in, child, family);
  }
  for (const { partners, together, family } of unions) {
    if (!together) for (const key of partners) add(ports.out, key, family);
  }
  return ports;
}

type Rows = Map<string, { y: number; h: number }>;

/** Heights and places from top to bottom. Every family has a band of its own in all columns. */
function placeRows(model: Model, texts: Map<string, EntryText>, metrics: AroundMetrics): Rows {
  const rows: Rows = new Map();
  const heightOf = (entry: Entry): number => texts.get(entry.key)?.h ?? 0;
  const put = (entry: Entry, y: number): void => {
    rows.set(entry.key, { y, h: heightOf(entry) });
  };
  const stackHeight = (cards: Entry[]): number =>
    cards.reduce((sum, card) => sum + heightOf(card), 0) + (cards.length - 1) * metrics.join;
  const putStack = (cards: Entry[], top: number): void => {
    let y = top;
    for (const card of cards) {
      put(card, y);
      y += heightOf(card) + metrics.join;
    }
  };

  // The middle column. The person's card is at 0.
  putStack([model.focus, ...model.partners], 0);
  const bottom = stackHeight([model.focus, ...model.partners]);
  let above = 0;
  for (const sibling of [...model.siblings.older].reverse()) {
    above -= heightOf(sibling) + metrics.rows;
    put(sibling, above);
  }
  let below = bottom + metrics.rows;
  for (const sibling of model.siblings.younger) {
    put(sibling, below);
    below += heightOf(sibling) + metrics.rows;
  }

  const upHeights = new Map<UpNode, number>();
  const upHeight = (node: UpNode): number => {
    let height = upHeights.get(node);
    if (height === undefined) {
      height = Math.max(heightOf(node.entry) + metrics.rows, upStack(node.above));
      upHeights.set(node, height);
    }
    return height;
  };
  const gapBefore = (node: UpNode, i: number): number => (i > 0 && node.first ? metrics.sets : 0);
  const upStack = (nodes: UpNode[]): number =>
    nodes.reduce((sum, node, i) => sum + gapBefore(node, i) + upHeight(node), 0);
  const placeUp = (nodes: UpNode[], middle: number): void => {
    let y = middle - upStack(nodes) / 2;
    nodes.forEach((node, i) => {
      y += gapBefore(node, i);
      const height = upHeight(node);
      put(node.entry, y + (height - heightOf(node.entry)) / 2);
      placeUp(node.above, y + height / 2);
      y += height;
    });
  };
  const middle = metrics.anchor;
  placeUp(model.up, middle);
  const strayUp = upStack(model.strayUp);
  placeUp(model.strayUp, middle + (upStack(model.up) + strayUp) / 2 + metrics.sets);

  const downHeights = new Map<DownNode, number>();
  const downHeight = (node: DownNode): number => {
    let height = downHeights.get(node);
    if (height === undefined) {
      const own = stackHeight(node.cards) + metrics.rows;
      height = Math.max(own, downStack(node.families.map(({ children }) => children)));
      downHeights.set(node, height);
    }
    return height;
  };
  const downStack = (groups: DownNode[][]): number =>
    groups.reduce(
      (sum, nodes, i) =>
        sum + (i > 0 ? metrics.families : 0) + nodes.reduce((s, node) => s + downHeight(node), 0),
      0,
    );
  const placeDown = (groups: DownNode[][], from: number): void => {
    let y = from;
    groups.forEach((nodes, i) => {
      if (i > 0) y += metrics.families;
      for (const node of nodes) {
        const height = downHeight(node);
        putStack(node.cards, y + (height - stackHeight(node.cards)) / 2);
        const own = node.families.map(({ children }) => children);
        placeDown(own, y + (height - downStack(own)) / 2);
        y += height;
      }
    });
  };
  const groups = model.families.map(({ children }) => children);
  const keys = model.families.flatMap(({ from }) => from);
  const sources = keys.flatMap((key) => {
    const row = rows.get(key);
    return row === undefined ? [] : [key === model.focus.key ? middle : row.y + row.h / 2];
  });
  const center = sources.length === 0 ? middle : (Math.min(...sources) + Math.max(...sources)) / 2;
  const top = center - downStack(groups) / 2;
  placeDown(groups, top);
  placeDown([model.strayDown], top + downStack(groups) + metrics.sets);
  return rows;
}

type Pin = { key: string; y: number; gutter: number };
type Wire = { link: Link; family: string; from: Pin; to: Pin; pass: number | null };

function drawLines(model: Model, rows: Rows, metrics: AroundMetrics) {
  const wires = wiresOf(model, rows, metrics);
  straighten(wires);
  const passes = findPasses(wires, model, rows);

  const gutters = new Map<number, Track>();
  const gutter = (at: number): Track => {
    let track = gutters.get(at);
    if (track === undefined) gutters.set(at, (track = new Track()));
    return track;
  };
  for (const { family, from, to, pass } of wires) {
    gutter(from.gutter).touch(family, from.y);
    gutter(from.gutter).touch(family, pass ?? to.y);
    gutter(to.gutter).touch(family, pass ?? from.y);
    gutter(to.gutter).touch(family, to.y);
  }

  const generations = [...model.entries.values()].map(({ generation }) => generation);
  const [first, last] = [Math.min(...generations), Math.max(...generations)];
  const columns: AroundLayout["columns"] = [];
  const lanesAt = new Map<number, { x: number; w: number; count: number }>();
  let x = 0;
  for (let at = first - 1; at <= last; at += 1) {
    if (at >= first) {
      const w = at === 0 ? metrics.middle : metrics.column;
      columns.push({ generation: at, x, w });
      x += w;
    }
    const isInner = at >= first && at < last;
    const count = gutters.get(at)?.lay() ?? 0;
    const w = count === 0 && !isInner ? 0 : Math.max(metrics.gutter, (count + 1) * step);
    lanesAt.set(at, { x, w, count });
    x += w;
  }
  const laneX = (at: number, family: string): number => {
    const { x: left, w, count } = lanesAt.get(at) as { x: number; w: number; count: number };
    return left + (w * ((gutters.get(at)?.lane(family) ?? 0) + 1)) / (Math.max(count, 1) + 1);
  };
  const sideX = ({ key, gutter: at }: Pin): number => {
    const generation = model.entries.get(key)?.generation ?? 0;
    const column = columns[generation - first] as AroundLayout["columns"][number];
    return at === generation ? column.x + column.w : column.x;
  };

  const ys = [...rows.values()].flatMap(({ y, h }) => [y, y + h]);
  const [upper, lower] = [Math.min(...ys, ...passes), Math.max(...ys, ...passes)];
  const shift = -Math.floor(upper / step) * step;
  for (const { link, family, from, to, pass } of wires) {
    const [fromX, toX] = [sideX(from), sideX(to)];
    const path: Point[] = [[fromX, from.y]];
    if (from.y !== to.y || pass !== null || toX === fromX) {
      const [firstLane, lastLane] = [laneX(from.gutter, family), laneX(to.gutter, family)];
      path.push([firstLane, from.y]);
      if (pass !== null) path.push([firstLane, pass], [lastLane, pass]);
      path.push([lastLane, to.y]);
    }
    path.push([toX, to.y]);
    link.points = path.map(([px, py]): Point => [px, py + shift]);
  }
  const links = [
    ...wires.map(({ link }) => link),
    ...model.unions.flatMap(({ together, ...union }) => (together ? [{ ...union, points: [] }] : [])),
  ];
  return { links, columns, width: x, height: lower + shift, shift };
}

/** Where each line leaves and enters, in the order of the model. */
function wiresOf(model: Model, rows: Rows, metrics: AroundMetrics): Wire[] {
  const middleOf = (key: string): number => {
    const { y, h } = rows.get(key) as { y: number; h: number };
    return key === model.focus.key ? y + metrics.anchor : y + h / 2;
  };
  const generationOf = (key: string): number => model.entries.get(key)?.generation ?? 0;

  // The families on one side of a card lie in the order of what they lead to.
  const ends = { out: new Map<string, string[]>(), in: new Map<string, string[]>() };
  const targets = new Map<string, number[]>();
  const note = (side: "out" | "in", key: string, family: string, other: number): void => {
    const families = listOf(ends[side], key);
    if (!families.includes(family)) families.push(family);
    listOf(targets, `${side} ${key} ${family}`).push(other);
  };
  for (const { from, child, family } of model.links) {
    if (from.length === 1) note("out", from[0] as string, family, middleOf(child));
    note("in", child, family, middleOf(from[0] as string));
  }
  const apart = model.unions.filter(({ together }) => !together);
  for (const { partners, family } of apart) {
    const [a, b] = partners;
    note("out", a, family, middleOf(b));
    note("out", b, family, middleOf(a));
  }
  const places = new Map<string, number>();
  for (const side of ["out", "in"] as const) {
    for (const [key, families] of ends[side]) {
      const aim = (family: string): number => {
        const list = targets.get(`${side} ${key} ${family}`) ?? [];
        return list.reduce((sum, y) => sum + y, 0) / Math.max(list.length, 1);
      };
      families.sort((a, b) => aim(a) - aim(b));
      const middle = (side === "out" ? outPlace : inPlace)(middleOf(key));
      spread(middle, families.length).forEach((y, i) => {
        places.set(`${side} ${key} ${families[i] as string}`, y);
      });
    }
  }
  const pin = (side: "out" | "in", key: string, family: string): Pin => ({
    key,
    y: places.get(`${side} ${key} ${family}`) ?? middleOf(key),
    gutter: side === "out" ? generationOf(key) : generationOf(key) - 1,
  });
  const couplePin = ([upper = "", lower = ""]: string[]): Pin => {
    const { y, h } = rows.get(upper) as { y: number; h: number };
    const below = rows.get(lower) as { y: number };
    const at = outPlace((y + h + below.y) / 2);
    return { key: upper, y: at, gutter: generationOf(upper) };
  };

  return [
    ...model.links.map(({ from, ...link }): Wire => {
      const { family, child } = link;
      const isCouple = from.length > 1;
      const start = isCouple ? couplePin(from) : pin("out", from[0] as string, family);
      return { link: { ...link, points: [] }, family, from: start, to: pin("in", child, family), pass: null };
    }),
    ...apart.map(({ together: _, ...union }): Wire => {
      const [a, b] = union.partners;
      const { family } = union;
      return {
        link: { ...union, points: [] },
        family,
        from: pin("out", a, family),
        to: pin("out", b, family),
        pass: null,
      };
    }),
  ];
}

/** A lone line between two cards almost side by side loses its tiny step. */
function straighten(wires: Wire[]): void {
  const byFamily = new Map<string, Wire[]>();
  for (const wire of wires) listOf(byFamily, wire.family).push(wire);
  for (const family of byFamily.values()) {
    const [wire] = family;
    if (wire === undefined || family.length > 1) continue;
    const { from, to } = wire;
    if (from.gutter === to.gutter && from.key !== to.key && Math.abs(from.y - to.y) < step) {
      if (wire.link.type === "parentage") to.y = from.y;
    }
  }
}

/**
 * Lines between columns that are not neighbors cross the ones between them at a height where those
 * have no card, or over or under everything.
 */
function findPasses(wires: Wire[], model: Model, rows: Rows): number[] {
  const columns = new Map<number, { y: number; h: number }[]>();
  for (const { key, generation } of model.entries.values()) {
    listOf(columns, generation).push(rows.get(key) as { y: number; h: number });
  }
  const pins = wires.flatMap(({ family, from, to }) => [
    { family, ...from },
    { family, ...to },
  ]);
  const all = [...rows.values()];
  const top = Math.min(...all.map(({ y }) => y)) - 2 * step;
  const bottom = Math.max(...all.map(({ y, h }) => y + h)) + 2 * step;
  const taken: { y: number; from: number; to: number; family: string }[] = [];

  for (const wire of wires) {
    const { family, from, to } = wire;
    if (from.gutter === to.gutter) continue;
    const [left, right] = [Math.min(from.gutter, to.gutter), Math.max(from.gutter, to.gutter)];
    const cards: { y: number; h: number }[] = [];
    for (let at = left + 1; at <= right; at += 1) cards.push(...(columns.get(at) ?? []));
    const nearPins = pins.filter(
      (other) => other.family !== family && other.gutter >= left && other.gutter <= right,
    );
    const nearPasses = taken.filter(
      (other) => other.family !== family && other.from <= right && other.to >= left,
    );
    const isFree = (y: number): boolean =>
      cards.every((card) => y < card.y - 4 || y > card.y + card.h + 4) &&
      nearPins.every((other) => Math.abs(other.y - y) >= 3) &&
      nearPasses.every((other) => Math.abs(other.y - y) >= 6);
    const wish = (from.y + to.y) / 2;
    // Just past the cards, and then further and further out: one of them is always free.
    const candidates = cards.flatMap((card) => [card.y - 6, card.y + card.h + 6]);
    candidates.push(wish, from.y, to.y);
    for (let i = 0; i <= nearPins.length + 2 * nearPasses.length; i += 1) {
      candidates.push(top - i * step, bottom + i * step);
    }
    candidates.sort((a, b) => Math.abs(a - wish) - Math.abs(b - wish));
    const y = candidates.find(isFree) ?? top;
    wire.pass = y;
    taken.push({ y, from: left, to: right, family });
  }
  return taken.map(({ y }) => y);
}

/** The person first, then the nearest kin, then the further ones. */
export function readingOrder(model: Model): string[] {
  const rank: Record<Role, number> = {
    focus: 0,
    partner: 1,
    sibling: 2,
    ancestor: 3,
    unknown: 3,
    descendant: 4,
  };
  const entries = [...model.entries.values()];
  const place = new Map(entries.map(({ key }, i) => [key, i]));
  const far = ({ generation, role }: Entry): number =>
    (generation < 0 ? 3 : rank[role]) * 1000 + Math.abs(generation);
  return entries
    .sort((a, b) => far(a) - far(b) || (place.get(a.key) ?? 0) - (place.get(b.key) ?? 0))
    .map(({ key }) => key);
}
