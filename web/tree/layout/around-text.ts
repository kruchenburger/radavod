import type { Entry } from "./around-model";
import type { Kin } from "./kin";
import { flow, type Run } from "./text";
import type { CardText, Line, Measure, Wording } from "./types";

/** Sizes of the view around a person, in its own pixels. The screen may change any of them. */
export type AroundMetrics = {
  /** The width of a column, and of the middle one. */
  column: number;
  middle: number;
  /** The least width of a gutter between columns. */
  gutter: number;
  /** Between the cards of a couple. */
  join: number;
  /** Around a card, between sets of parents, between families of one person. */
  rows: number;
  sets: number;
  families: number;
  padX: number;
  padY: number;
  /** Heights of lines. */
  name: number;
  detail: number;
  focusName: number;
  focusDetail: number;
  /** Room for buttons: on the card of the person and beside an unknown place. */
  actions: number;
  aside: number;
  /** Where on the card of the person the lines come in. */
  anchor: number;
};

export const aroundMetrics: AroundMetrics = {
  column: 152,
  middle: 236,
  gutter: 34,
  join: 4,
  rows: 22,
  sets: 14,
  families: 8,
  padX: 22,
  padY: 4,
  name: 21,
  detail: 18,
  focusName: 38,
  focusDetail: 21,
  actions: 44,
  aside: 32,
  anchor: 40,
};

type TextOptions = { measure: Measure; wording: Wording; metrics: AroundMetrics };

export function textOfEntry(
  entry: Entry,
  kin: Kin,
  options: TextOptions,
): { lines: Line[]; h: number } {
  const { wording, metrics, measure } = options;
  const { padX, padY, column, middle, aside } = metrics;
  const isMiddle = entry.generation === 0;
  const x = isMiddle ? padX : 0;
  const width = isMiddle ? middle - 2 * padX : column - 4;
  if (entry.unknown !== undefined) {
    const runs: Run[] = [{ text: wording.unknown(entry.unknown), part: "unknown", style: "name" }];
    const size = { measure, width: width - aside, lines: 2, lineHeight: metrics.name };
    const lines = flow(runs, { ...size, x, y: padY });
    return { lines, h: Math.max(bottomOf(lines), aside) + padY };
  }
  const person = entry.person === null ? undefined : kin.person(entry.person);
  const text = person === undefined ? null : wording.person(person);
  if (text === null) return { lines: [], h: metrics.name + 2 * padY };
  return entry.role === "focus"
    ? focusText(text, { ...options, x, width })
    : personText(text, entry.direct, { ...options, x, width });
}

function personText(
  text: CardText,
  isDirect: boolean,
  { measure, metrics, x, width }: TextOptions & { x: number; width: number },
): { lines: Line[]; h: number } {
  const { padY } = metrics;
  const name = flow(nameRuns(text, isDirect), {
    measure,
    width,
    lines: 2,
    lineHeight: metrics.name,
    x,
    y: padY,
  });
  const below = Math.max(bottomOf(name), metrics.name + padY);
  const detail = flow(detailRuns(text), {
    measure,
    width,
    lines: 2,
    lineHeight: metrics.detail,
    x,
    y: below,
  });
  return { lines: [...name, ...detail], h: Math.max(bottomOf(detail), below) + padY };
}

function focusText(
  text: CardText,
  { measure, metrics, x, width }: TextOptions & { x: number; width: number },
): { lines: Line[]; h: number } {
  const lines: Line[] = [];
  let y = metrics.padY * 4;
  const set = (run: Run, lineHeight: number): void => {
    const own = flow([run], { measure, width, lines: 2, lineHeight, x, y });
    lines.push(...own);
    y = Math.max(y, bottomOf(own));
  };
  set({ text: text.given, part: "given", style: "focusName" }, metrics.focusName);
  set({ text: text.surname, part: "surname", style: "focusName" }, metrics.focusName);
  y = Math.max(y, metrics.focusName + metrics.padY * 4) + metrics.padY;
  set({ text: text.years, part: "years", style: "focusDetail" }, metrics.focusDetail);
  set({ text: text.branch, part: "branch", style: "focusDetail" }, metrics.focusDetail);
  return { lines, h: y + metrics.actions + metrics.padY * 2 };
}

export function nameRuns({ given, surname }: CardText, isDirect: boolean): Run[] {
  const style = isDirect ? "nameDirect" : "name";
  return [
    { text: given, part: "given", style },
    { text: surname, part: "surname", style },
  ];
}

export function detailRuns({ years, branch }: CardText): Run[] {
  return [
    { text: years, part: "years", style: "detail" },
    { text: branch, part: "branch", style: "detail" },
  ];
}

export const bottomOf = (lines: Line[]): number =>
  Math.max(0, ...lines.map(({ y, h }) => y + h));
