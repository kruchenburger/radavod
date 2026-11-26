import type { TreeSnapshot } from "../../../src/shared/tree";
import type { Entry, Model } from "./around-model";
import { kinOf, listOf } from "./kin";
import { step } from "./lanes";
import { flow, nameLines, type Run } from "./text";
import type { CardText, Line, Measure, TextStyle, Wording } from "./types";

/** Sizes of the view around a person, those of docs/design.md. The screen may change any of them. */
export type AroundMetrics = {
  /** The width of a column, and of the strip of the chosen person. */
  column: number;
  strip: number;
  /** The least width of the gap between columns. It grows with the number of lines in it. */
  gap: number;
  /** Between lines in one gap. */
  lane: number;
  /** Between the cards of a couple. */
  join: number;
  /** Around a card, between sets of parents, between families of one person. */
  rows: number;
  sets: number;
  families: number;
  /** Around the text of the strip. */
  padX: number;
  padY: number;
  /** A sibling stands this far in. */
  siblings: number;
  /** Room for the sign of a union before the name of a spouse. */
  ring: number;
  /** Room for the number of folded descendants. */
  count: number;
  /** Heights of lines. */
  name: number;
  detail: number;
  focusName: number;
  focusNameDouble: number;
  focusDetail: number;
  /** Room for buttons: on the card of the person, under a partner and beside an unknown place. */
  actions: number;
  children: number;
  aside: number;
  /** Where on the card of the person the lines come in. */
  anchor: number;
};

export const aroundMetrics: AroundMetrics = {
  column: 152,
  strip: 236,
  gap: 34,
  lane: 6,
  join: 4,
  rows: 22,
  sets: 14,
  families: 8,
  padX: 22,
  padY: 4,
  siblings: 20,
  ring: 18,
  count: 30,
  name: 21,
  detail: 18,
  focusName: 38,
  focusNameDouble: 31,
  focusDetail: 21,
  actions: 44,
  children: 26,
  aside: 32,
  anchor: 36,
};

export type TextOptions<M> = { measure: Measure; wording: Wording; metrics: M };
export type EntryText = { lines: Line[]; h: number };

/** Texts of all cards. Their heights leave room for every line that comes to the card. */
export function textsOf(
  snapshot: TreeSnapshot,
  model: Model,
  options: TextOptions<AroundMetrics>,
): Map<string, EntryText> {
  const kin = kinOf(snapshot);
  const ports = portsOf(model);
  const apart = apartOf(snapshot, model, options.wording);
  const texts = new Map<string, EntryText>();
  for (const entry of model.entries.values()) {
    const person = entry.person === null ? undefined : kin.person(entry.person);
    const text = person === undefined ? null : options.wording.person(person);
    const { lines, h } = withApart(textOf(entry, text, options), apart.get(entry.key) ?? [], {
      ...options,
      ...boxOf(entry, options.metrics),
      lineHeight: options.metrics.name,
    });
    const room = entry.role === "partner" && model.open !== null ? options.metrics.children : 0;
    const most = ports.get(entry.key) ?? 0;
    texts.set(entry.key, { lines, h: Math.max(h + room, (most + 2) * step) });
  }
  return texts;
}

/** The most families whose lines take places on one side of a card. */
function portsOf({ links, unions, references }: Model): Map<string, number> {
  const sides = new Map<string, Set<string>>();
  const add = (side: string, key: string, family: string): void => {
    const name = `${side} ${key}`;
    const families = sides.get(name);
    if (families === undefined) sides.set(name, new Set([family]));
    else families.add(family);
  };
  for (const { from, child, family } of links) {
    for (const key of from) add("out", key, family);
    add("in", child, family);
  }
  for (const { partners, isTogether, isApart, family } of unions) {
    if (!isTogether && !isApart) for (const key of partners) add("out", key, family);
  }
  for (const { reference, to, family } of references) {
    for (const key of [reference, to[0] ?? ""]) add("in", key, family);
  }
  const most = new Map<string, number>();
  for (const [name, { size }] of sides) {
    const key = name.slice(name.indexOf(" ") + 1);
    most.set(key, Math.max(most.get(key) ?? 0, size));
  }
  return most;
}

function textOf(
  entry: Entry,
  text: CardText | null,
  options: TextOptions<AroundMetrics>,
): EntryText {
  const { metrics } = options;
  const box = { ...options, ...boxOf(entry, metrics) };
  if (entry.role === "focus" && text !== null) return focusText(text, box);
  if (entry.unknown !== undefined || entry.reference !== undefined) return placeText(entry, box);
  if (text === null) return { lines: [], h: metrics.name + 2 * metrics.padY };
  if (entry.folded !== undefined) {
    const [given, surname] = nameRuns(text, entry.direct);
    const years: Run = { text: text.years, part: "years", style: "detail" };
    const lines = flow([given, surname, years], {
      ...size(box, metrics.name),
      width: box.width - metrics.count,
      // A name with a break leaves a line for the years.
      lines: 3,
    });
    return { lines, h: Math.max(bottomOf(lines), box.top + metrics.name) + metrics.padY };
  }
  const name = nameLines(...nameRuns(text, entry.direct), {
    ...size(box, metrics.name),
    indent: entry.isSpouse ? metrics.ring : 0,
  });
  const below = Math.max(bottomOf(name), box.top + metrics.name);
  // Dates told in words are long, and the branch still has to stand after them.
  const detail = flow(detailRuns(text), { ...size(box, metrics.detail), y: below, lines: 3 });
  return { lines: [...name, ...detail], h: Math.max(bottomOf(detail), below) + metrics.padY };
}

type TextBox = TextOptions<AroundMetrics> & { x: number; width: number; top: number };

/** Where the text of an entry stands in its card. */
function boxOf(entry: Entry, metrics: AroundMetrics): { x: number; width: number; top: number } {
  const isInStrip = entry.generation === 0;
  const indent = isInStrip ? metrics.padX + (entry.role === "sibling" ? metrics.siblings : 0) : 0;
  return {
    x: indent,
    width: (isInStrip ? metrics.strip - metrics.padX : metrics.column - 4) - indent,
    top: isInStrip ? 2 * metrics.padY : metrics.padY,
  };
}

/** For each card, the partners in unions that stand apart: their words and who they are. */
export function apartOf(
  snapshot: TreeSnapshot,
  model: Model,
  wording: Wording,
): Map<string, { text: string; to: string }[]> {
  const kin = kinOf(snapshot);
  const apart = new Map<string, { text: string; to: string }[]>();
  for (const { partners, isApart } of model.unions) {
    if (!isApart) continue;
    const [a, b] = partners;
    for (const [own, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const to = model.entries.get(other)?.person ?? null;
      const person = to === null ? undefined : kin.person(to);
      if (to !== null && person !== undefined) {
        listOf(apart, own).push({ text: wording.apart(person), to });
      }
    }
  }
  return apart;
}

/**
 * The partners who stand apart, each on a line of its own under everything else. The card grows
 * by as much, so what it keeps at its foot (the buttons of the chosen person) stays there.
 */
export function withApart(
  text: EntryText,
  apart: { text: string; to: string }[],
  box: { measure: Measure; x: number; width: number; lineHeight: number },
): EntryText {
  if (apart.length === 0) return text;
  const lines = [...text.lines];
  const top = bottomOf(text.lines);
  let y = top;
  for (const { text: words, to } of apart) {
    const run: Run = { text: words, part: "apart", style: "reference" };
    // One line, so that it is one link; the screen tells the whole of it to a reader.
    const own = flow([run], { ...box, y, lines: 1 });
    lines.push(...own.map((line) => ({ ...line, to })));
    y = Math.max(y, bottomOf(own));
  }
  return { lines, h: text.h + y - top };
}

const size = ({ measure, width, x, top }: TextBox, lineHeight: number) => ({
  measure,
  width,
  lineHeight,
  x,
  y: top,
  lines: 2,
});

function placeText(entry: Entry, box: TextBox): EntryText {
  const { metrics, wording, top, width } = box;
  const { unknown, reference } = entry;
  if (unknown !== undefined) {
    const run: Run = { text: wording.unknown(unknown), part: "unknown", style: "reference" };
    const lines = flow([run], {
      ...size(box, metrics.name),
      width: width - metrics.aside,
      indent: entry.isSpouse ? metrics.ring : 0,
    });
    return { lines, h: Math.max(bottomOf(lines), top + metrics.aside) + metrics.padY };
  }
  if (reference === undefined) return { lines: [], h: metrics.name };
  const { title, detail } = wording.reference(reference);
  const head = flow([{ text: title, part: "title", style: "reference" }], size(box, metrics.name));
  const below = Math.max(bottomOf(head), top + metrics.name);
  const rest = flow([{ text: detail, part: "detail", style: "detail" }], {
    ...size(box, metrics.detail),
    y: below,
  });
  return { lines: [...head, ...rest], h: Math.max(bottomOf(rest), below) + metrics.padY };
}

function focusText(text: CardText, box: TextBox): EntryText {
  const { metrics } = box;
  const isDouble = /\p{L}-\p{L}/u.test(text.surname);
  const style = isDouble ? "focusNameDouble" : "focusName";
  const nameHeight = isDouble ? metrics.focusNameDouble : metrics.focusName;
  const lines: Line[] = [];
  let y = box.top + 2 * metrics.padY;
  const set = (run: Run, lineHeight: number): void => {
    const own = flow([run], { ...size(box, lineHeight), y });
    lines.push(...own);
    y = Math.max(y, bottomOf(own));
  };
  set({ text: text.given, part: "given", style }, nameHeight);
  set({ text: text.surname, part: "surname", style }, nameHeight);
  y = Math.max(y, 2 * metrics.anchor) + metrics.padY;
  set({ text: text.years, part: "years", style: "focusDetail" }, metrics.focusDetail);
  set({ text: text.branch, part: "branch", style: "focusDetail" }, metrics.focusDetail);
  return { lines, h: y + metrics.actions + 2 * metrics.padY };
}

export function nameRuns({ given, surname }: CardText, isDirect: boolean): [Run, Run] {
  const style = isDirect ? "nameDirect" : "name";
  return [
    { text: given, part: "given", style },
    { text: surname, part: "surname", style },
  ];
}

/** Between the parts of a line about a person: dates in words run on into a name otherwise. */
export const dot = "·";

export function detailRuns({ years, branch }: CardText, style: TextStyle = "detail"): Run[] {
  return [
    { text: branch.trim() === "" ? years : `${years}\u00a0${dot}`, part: "years", style },
    { text: branch, part: "branch", style },
  ];
}

export const bottomOf = (lines: Line[]): number => Math.max(0, ...lines.map(({ y, h }) => y + h));
