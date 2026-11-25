import type { TreeSnapshot } from "../../../src/shared/tree";
import { type AroundCard, type AroundLayout, emptyAround } from "./around";
import {
  type DownNode,
  type Entry,
  type Family,
  type Model,
  type ModelLink,
  modelOf,
  type Reach,
  type UpNode,
} from "./around-model";
import { bottomOf, detailRuns, type EntryText, nameRuns, type TextOptions } from "./around-text";
import { kinOf, listOf } from "./kin";
import { spread, step, Track } from "./lanes";
import { flow, nameLines, type Run } from "./text";
import type { CardText, Line, Link, Measure, Point, Wording } from "./types";

/** Sizes of the list on a phone, those of docs/design.md. The screen may change any of them. */
export type NarrowMetrics = {
  /** One step of indent, and how far left of its names a rail runs. */
  indent: number;
  rail: number;
  /** Between rails in one step, and between lines in the margin. */
  lane: number;
  /** The least room for a name, however deep it stands. */
  least: number;
  padY: number;
  /** Between a name and what stands at the end of its line. */
  gap: number;
  ring: number;
  count: number;
  aside: number;
  name: number;
  detail: number;
  focusName: number;
  focusDetail: number;
  actions: number;
};

export const narrowMetrics: NarrowMetrics = {
  indent: 19,
  rail: 9,
  lane: 5,
  least: 90,
  padY: 7,
  gap: 8,
  ring: 18,
  count: 30,
  aside: 44,
  name: 21,
  detail: 18,
  focusName: 31,
  focusDetail: 21,
  actions: 52,
};

export type NarrowOptions = Reach & {
  measure: Measure;
  wording: Wording;
  /** The width of the list, margins of the page left out. */
  width: number;
  metrics?: Partial<NarrowMetrics>;
};

export type NarrowLayout = Omit<AroundLayout, "columns">;

type Item = { entry: Entry; level: number };

/** A line beside the names: from a row to a deeper or a shallower one below. */
type Rail = { link: ModelLink; level: number; source: string; target: string; as: RailKind };
type RailKind = "up" | "sibling" | "down";

/**
 * The same people as an indented list: ancestors above, partners with their children below. Rails
 * run left of the names they join. Lines that no rail can carry run along the right margin.
 */
export function aroundNarrow(
  snapshot: TreeSnapshot,
  focus: string,
  options: NarrowOptions,
): NarrowLayout {
  const model = modelOf(snapshot, focus, options);
  if (model === null) return emptyAround();
  const metrics = { ...narrowMetrics, ...options.metrics };
  const items = itemsOf(model);
  const index = new Map(items.map(({ entry }, i) => [entry.key, i]));
  const { rails, wires } = sortLines(model, items);

  // Rows have whole numbers; a rail leaves a row under it and enters the next one over it.
  const row = (key: string, offset = 0): number => (index.get(key) ?? 0) * 100 + offset;
  const zones = new Map<number, Track>();
  for (const { link, level, source, target, as } of rails) {
    let zone = zones.get(level);
    if (zone === undefined) zones.set(level, (zone = new Track()));
    zone.touch(link.family, row(source, as === "down" ? 50 : 0));
    zone.touch(link.family, row(target, as === "up" ? -50 : 0));
  }
  const margin = new Track();
  for (const { family, source, target } of wires) {
    // A row may hold ends of several lines, each at a place of its own.
    for (const key of [source, target]) {
      margin.touch(family, row(key, -20));
      margin.touch(family, row(key, 20));
    }
  }
  const marginLanes = margin.lay();
  const marginWidth = marginLanes === 0 ? 0 : (marginLanes + 1) * metrics.lane;

  const deepest = Math.max(...items.map(({ level }) => level));
  const lanes: number[] = [0];
  const lefts: number[] = [0];
  for (let level = 1; level <= deepest; level += 1) {
    const count = zones.get(level)?.lay() ?? 0;
    const width = Math.max(
      metrics.indent,
      metrics.rail + metrics.lane * Math.max(0, count - 1) + metrics.lane,
    );
    lanes.push(count);
    lefts.push((lefts[level - 1] ?? 0) + width);
  }
  const leftOf = (level: number): number => lefts[level] ?? 0;
  const railX = (level: number, family: string): number => {
    const fromRight = (lanes[level] ?? 1) - 1 - (zones.get(level)?.lane(family) ?? 0);
    return leftOf(level) - metrics.rail - metrics.lane * fromRight;
  };
  const right = Math.max(options.width - marginWidth, leftOf(deepest) + metrics.least);
  const marginX = (family: string): number => right + metrics.lane * (margin.lane(family) + 1);

  // Places of lines on the sides of every row.
  const sides = new Map<string, string[]>();
  const note = (key: string, side: "left" | "right", family: string): void => {
    const families = listOf(sides, `${side} ${key}`);
    if (!families.includes(family)) families.push(family);
  };
  for (const { link, source, target, as } of rails) {
    if (as !== "down") note(source, "left", link.family);
    if (as !== "up") note(target, "left", link.family);
  }
  for (const { family, source, target } of wires) {
    note(source, "right", family);
    note(target, "right", family);
  }

  const kin = kinOf(snapshot);
  const cards: AroundCard[] = [];
  let y = 0;
  for (const { entry, level } of items) {
    const x = leftOf(level);
    const person = entry.person === null ? undefined : kin.person(entry.person);
    const text = person === undefined ? null : options.wording.person(person);
    const own = textOf(entry, text, { ...options, metrics, width: right - x });
    const most = Math.max(
      ...(["left", "right"] as const).map((side) => sides.get(`${side} ${entry.key}`)?.length ?? 0),
    );
    const h = Math.max(own.h, (most + 2) * step);
    cards.push({ ...entry, lines: own.lines, x, y, w: right - x, h });
    y += h;
  }
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const cardOf = (key: string): AroundCard => byKey.get(key) as AroundCard;
  const sideY = (key: string, side: "left" | "right", family: string): number => {
    const card = cardOf(key);
    const families = sides.get(`${side} ${key}`) ?? [];
    const places = spread(card.y + card.h / 2, families.length);
    return places[families.indexOf(family)] ?? card.y + card.h / 2;
  };

  const links: Link[] = rails.map(({ link, level, source, target, as }) => {
    const { family } = link;
    const x = railX(level, family);
    const [upper, lower] = [cardOf(source), cardOf(target)];
    const start: Point[] =
      as === "down"
        ? [[x, upper.y + upper.h]]
        : [
            [upper.x, sideY(source, "left", family)],
            [x, sideY(source, "left", family)],
          ];
    const end: Point[] =
      as === "up"
        ? [[x, lower.y]]
        : [
            [x, sideY(target, "left", family)],
            [lower.x, sideY(target, "left", family)],
          ];
    return { ...withoutSource(link), points: [...start, ...end] };
  });
  for (const { link, family, source, target } of wires) {
    const [from, to] = [sideY(source, "right", family), sideY(target, "right", family)];
    const x = marginX(family);
    const points: Point[] = [
      [right, from],
      [x, from],
      [x, to],
      [right, to],
    ];
    links.push({ ...link, points });
  }
  for (const { isTogether, ...union } of model.unions) {
    if (isTogether) links.push({ ...union, points: [] });
  }
  return {
    cards,
    links,
    width: right + marginWidth,
    height: y,
    focus: model.focus.key,
    siblings: model.siblingIds,
    open: model.open,
    order: cards.map(({ key }) => key),
  };
}

function itemsOf(model: Model): Item[] {
  const items: Item[] = [];
  const climb = (nodes: UpNode[]): void => {
    for (const { entry, above } of nodes) {
      climb(above);
      items.push({ entry, level: -entry.generation });
    }
  };
  const descend = (cards: Entry[], families: Family[], level: number): void => {
    for (const entry of cards) {
      items.push({ entry, level });
      for (const { from, children } of families) {
        // The children of a couple come after its second card.
        if (from.at(-1) !== entry.key) continue;
        for (const child of children) descendNode(child, level + 1);
      }
    }
  };
  const descendNode = ({ cards, families }: DownNode, level: number): void =>
    descend(cards, families, level);

  climb(model.strayUp);
  climb(model.up);
  for (const entry of [...model.siblings.older, ...model.siblings.younger]) {
    items.push({ entry, level: 1 });
  }
  descend([model.focus, ...model.partners], model.families, 0);
  for (const node of model.strayDown) descendNode(node, node.cards[0]?.generation ?? 1);
  return items;
}

type Wire = { link: Link; family: string; source: string; target: string };

/** What only the layout needs to know stays out of the links it returns. */
function withoutSource(link: ModelLink): Omit<ModelLink, "from"> {
  const { from: _, ...rest } = link;
  return rest;
}

/** Lines a rail can carry, and the rest. */
function sortLines(model: Model, items: Item[]): { rails: Rail[]; wires: Wire[] } {
  const levels = new Map(items.map(({ entry, level }) => [entry.key, level]));
  const steps = new Map<string, RailKind>();
  const climb = (nodes: UpNode[], child: string): void => {
    for (const { entry, above } of nodes) {
      steps.set(JSON.stringify([entry.key, child]), "up");
      climb(above, entry.key);
    }
  };
  climb(model.up, model.focus.key);
  for (const { entry, above } of model.strayUp) climb(above, entry.key);
  const parents = new Set(model.up.map(({ entry }) => entry.key));
  const descend = (families: Family[]): void => {
    for (const { from, children } of families) {
      for (const { cards, families: own } of children) {
        steps.set(JSON.stringify([from.at(-1), cards[0]?.key]), "down");
        descend(own);
      }
    }
  };
  descend(model.families);
  for (const { families } of model.strayDown) descend(families);
  const siblings = new Set(
    [...model.siblings.older, ...model.siblings.younger].map(({ key }) => key),
  );

  const rails: Rail[] = [];
  const wires: Wire[] = [];
  for (const link of model.links) {
    const source = link.from.at(-1) ?? "";
    const target = link.child;
    const isSibling = siblings.has(target) && parents.has(source);
    const as = isSibling ? "sibling" : steps.get(JSON.stringify([source, target]));
    if (as === undefined) {
      const drawn = { ...withoutSource(link), points: [] };
      wires.push({ link: drawn, family: link.family, source, target });
      continue;
    }
    const level = levels.get(as === "down" ? target : source) ?? 1;
    rails.push({ link, level, source, target, as });
  }
  for (const { isTogether, ...union } of model.unions) {
    if (isTogether) continue;
    const [source, target] = union.partners;
    wires.push({ link: { ...union, points: [] }, family: union.family, source, target });
  }
  for (const reference of model.references) {
    const { reference: source, to, family } = reference;
    wires.push({ link: { ...reference, points: [] }, family, source, target: to[0] ?? "" });
  }
  return { rails, wires };
}

type TextBox = TextOptions<NarrowMetrics> & { width: number };

function textOf(entry: Entry, text: CardText | null, box: TextBox): EntryText {
  const { metrics, wording } = box;
  const least = { lines: [], h: metrics.name + 2 * metrics.padY };
  if (entry.unknown !== undefined) {
    const run: Run = { text: wording.unknown(entry.unknown), part: "unknown", style: "reference" };
    const width = box.width - metrics.aside;
    const indent = entry.isSpouse ? metrics.ring : 0;
    const lines = flow([run], { ...size(box, metrics.name), width, indent });
    return { lines, h: Math.max(bottomOf(lines) + metrics.padY, metrics.aside) };
  }
  if (entry.reference !== undefined) {
    const { title, detail } = wording.reference(entry.reference);
    const lines = flow(
      [
        { text: title, part: "title", style: "reference" },
        { text: detail, part: "detail", style: "detail" },
      ],
      size(box, metrics.name),
    );
    return { lines, h: Math.max(bottomOf(lines) + metrics.padY, least.h) };
  }
  if (text === null) return least;
  if (entry.role === "focus") return focusText(text, box);

  const room = entry.folded === undefined ? box.width : box.width - metrics.count;
  const name = nameLines(...nameRuns(text, entry.direct), {
    ...size({ ...box, width: room }, metrics.name),
    indent: entry.isSpouse ? metrics.ring : 0,
  });
  const detail =
    entry.folded === undefined ? detailRuns(text) : detailRuns({ ...text, branch: "" });
  const beside = besideName(name, detail, { ...box, width: room });
  if (beside !== null) return { lines: [...name, ...beside], h: least.h };
  const below = Math.max(bottomOf(name), metrics.padY + metrics.name);
  const lines = flow(detail, { ...size({ ...box, width: room }, metrics.detail), y: below });
  return { lines: [...name, ...lines], h: Math.max(bottomOf(lines), below) + metrics.padY };
}

const size = ({ measure, width, metrics }: TextBox, lineHeight: number) => ({
  measure,
  width,
  lineHeight,
  lines: 2,
  x: 0,
  y: metrics.padY,
});

/** Years and the branch at the end of the line, when everything fits on one. */
function besideName(name: Line[], runs: Run[], box: TextBox): Line[] | null {
  const { measure, metrics, width } = box;
  const last = name.at(-1);
  if (name.some(({ y }) => y !== metrics.padY)) return null;
  const details = runs.filter(({ text }) => text.trim() !== "");
  const widths = details.map(({ text, style }) => measure(text, style));
  const total = widths.reduce((sum, w) => sum + w + metrics.gap, 0);
  const end = last === undefined ? 0 : last.x + last.w;
  if (end + total > width) return null;
  let x = width - total + metrics.gap;
  return details.map(({ text, part, style }, i): Line => {
    const w = widths[i] ?? 0;
    const line = { text, part, style, x, y: metrics.padY, w, h: metrics.name };
    x += w + metrics.gap;
    return line;
  });
}

function focusText(text: CardText, box: TextBox): EntryText {
  const { metrics } = box;
  const name = nameLines(
    { text: text.given, part: "given", style: "focusNameNarrow" },
    { text: text.surname, part: "surname", style: "focusNameNarrow" },
    { ...size(box, metrics.focusName), y: 2 * metrics.padY },
  );
  let y = Math.max(bottomOf(name), 2 * metrics.padY + metrics.focusName) + metrics.padY / 2;
  const lines = [...name];
  for (const run of detailRuns(text)) {
    const style = "focusDetail";
    const own = flow([{ ...run, style }], { ...size(box, metrics.focusDetail), y });
    lines.push(...own);
    y = Math.max(y, bottomOf(own));
  }
  return { lines, h: y + metrics.actions + metrics.padY };
}
