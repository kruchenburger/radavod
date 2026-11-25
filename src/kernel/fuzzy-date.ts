import {
  andWords,
  betweenWords,
  calendarWords,
  dayWords,
  monthOf,
  prepositions,
  qualifierWords,
  yearWords,
} from "./date-words";

/** A date as it was written, always kept, and what could be read in it. */
export type FuzzyDate = { text: string; parsed: ParsedDate | null };

export type ParsedDate = {
  qualifier: "exact" | "about" | "before" | "after" | "between";
  calendar: "julian" | "gregorian";
  from: PartialDate;
  /** The second date of "between". */
  to?: PartialDate;
};

/** Down to the smallest known part. There is no day without a month. */
export type PartialDate = { year: number; month?: number; day?: number };

type Calendar = ParsedDate["calendar"];
type Point = { calendar: Calendar; date: PartialDate };
/** A part of a text without its mark of a calendar. A mark after a date may speak for two dates. */
type Side = { text: string; date: PartialDate | null; calendar?: Calendar; isAfter: boolean };

/** No date is longer. It bounds the work. */
const longest = 120;

/**
 * Reads what families, archives and GEDCOM write in Russian, Belarusian, Polish and English. The
 * whole text is read or nothing: a word it does not know may change the meaning. It does not guess a
 * century, a calendar (Gregorian unless it is named) or which of two numbers is the month.
 *
 * It does not read: feasts, seasons, centuries, parts of a year or of a decade; a year of fewer than
 * four digits or with a digit missing; a day with no month; 05/12/1885 and 05-12-1885, where either
 * may be the month; 1885/86 and 1885-05; periods ("from ... to ...", "1-13 May 1885", "May - June
 * 1885"); a choice ("1885 or 1886"); two qualifiers at once; one day in both calendars when the two
 * are not in the month or the year that is written once ("20/2 May 1885", "25 December 1885
 * (6 January)"); a date with its event ("b. 1885"); a whole date in brackets; other calendars; INT
 * and the phrases of GEDCOM.
 */
export function parseFuzzyDate(text: string): FuzzyDate {
  return { text, parsed: text.length > longest ? null : parse(tidy(text)) };
}

/**
 * The day that orders a date: the first day it can be read as, by the count of Julian day numbers,
 * which is one for both calendars. A month and a year begin with their first day, "about" and
 * "after" with their date, "between" with its first date. Null when no day is the first: for
 * "before" and for a date nobody could read.
 */
export function sortKey({ parsed }: FuzzyDate): number | null {
  return parsed === null || parsed.qualifier === "before"
    ? null
    : dayNumber(parsed.from, parsed.calendar);
}

const year = "([1-9]\\d{3})";
const afterYear = `(?:-(?:й|го|м))?(?:\\s*(?:${yearWords})\\.?)?`;
const anyYear = `(?:(?:of|roku|rokiem|r\\.)\\s+)?${year}${afterYear}`;
/** What is written for a day or a month nobody knows. */
const gap = "[?_*…]{1,4}|[xх]{2,4}|[-–—]{1,2}";
const day = `["«„“]?(\\d{1,2})["»”“]?(?:-?(?:го|га|ага|е|ое|st|nd|rd|th))?(?:\\s+(?:${dayWords}))?`;
const dayOrGap = `(?:${day}|["«„“]?(?:${gap}|\\.{2,3})["»”“]?)`;
const word = "(\\p{L}+)\\.?";
const space = ",?\\s+";
const apart = `(?:\\.?${space}|\\s*[-./]\\s*)`;

const whole = (source: string): RegExp => new RegExp(`^(?:${source})$`, "iu");

type Reader = (...parts: (string | undefined)[]) => PartialDate | null;

/** Every way to write one date. A reader gets its parts in the order they are written. */
const forms: [RegExp, Reader][] = [
  // 1885
  [whole(anyYear), (y) => build(y)],
  // 12.05.1885, ..05.1885, __.__.1885, ..V.1885
  [
    whole(`(\\d{1,2}|${gap}|\\.)?\\s*\\.\\s*(\\d{1,2}|${gap}|\\.)?\\s*\\.\\s*${year}${afterYear}`),
    (d, m, y) => build(y, number(m), number(d)),
  ],
  [
    whole(`(?:${gap}|\\.)?\\s*\\.\\s*([ivxіх]{1,4})\\s*\\.\\s*${year}${afterYear}`),
    (m, y) => inWords(y, m),
  ],
  // 1885-05-12
  [whole(`${year}([-./])(\\d{1,2})\\2(\\d{1,2})`), (y, _, m, d) => build(y, number(m), number(d))],
  // 13/05/1885, 05/13/1885
  [
    whole(`(\\d{1,2})([-/])(\\d{1,2})\\2${year}${afterYear}`),
    (first, _, second, y) => inOneOrder(number(first), number(second), y),
  ],
  // 05.1885
  [whole(`(\\d{1,2})[-./]${year}${afterYear}`), (m, y) => (number(m) ? build(y, number(m)) : null)],
  // 12 May 1885, __ May 1885
  [whole(`${dayOrGap}${apart}${word}${apart}${anyYear}`), (d, m, y) => inWords(y, m, d)],
  // May 12, 1885
  [whole(`${word}${space}${day}${space}${anyYear}`), (m, d, y) => inWords(y, m, d)],
  // May 1885
  [whole(`${word}${apart}${anyYear}`), (m, y) => inWords(y, m)],
  // 1885, May 12
  [whole(`${year}${afterYear}${space}${word}(?:\\s+${day})?`), (y, m, d) => inWords(y, m, d)],
  // 1885, 12 May
  [whole(`${year}${afterYear}${space}${day}\\s+${word}`), (y, d, m) => inWords(y, m, d)],
];

const marked = (words: string): RegExp => {
  const mark = `(?<!\\p{L})(?:${words})(?!\\p{L})`;
  return new RegExp(`\\(\\s*${mark}\\s*\\)|\\[\\s*${mark}\\s*\\]|,?\\s*${mark}`, "iu");
};
const calendars: [Calendar, RegExp][] = [
  ["julian", marked(calendarWords.julian)],
  ["gregorian", marked(calendarWords.gregorian)],
];

const opening = (words: string): string => `^(?:${words})(?:\\.\\s*|\\s+)`;
const qualifiers: ["about" | "before" | "after", RegExp][] = [
  [
    "about",
    new RegExp(
      `${opening(qualifierWords.about)}|^[~≈]\\s*|^c(?!.*\\p{Script=Cyrillic})(?:\\.\\s*|\\s+|(?=\\d))`,
      "iu",
    ),
  ],
  ["before", new RegExp(opening(qualifierWords.before), "iu")],
  ["after", new RegExp(opening(qualifierWords.after), "iu")],
];
const betweenOpening = new RegExp(opening(betweenWords), "iu");
const and = new RegExp(`^(.+?)\\s(?:${andWords})\\s(.+)$`, "iu");
const range = whole(
  `(.+?)\\s?[–—]\\s?(.+)|(.+?)\\s-\\s(.+)|([^-]*\\d{4}${afterYear})\\s?-\\s?([^-]*\\d{4}${afterYear})`,
);
const preposition = new RegExp(`^(?:${prepositions})\\s+`, "iu");
/** The 1900s may be ten years or a hundred, so they are not read. */
const decade = whole(`([1-9]\\d[1-9])0(?:\\s*-?(?:е|х|я)|'?s)${afterYear}`);

function tidy(text: string): string {
  // The spelling before 1918 is undone as far as the words of a date need it.
  const modern = text
    .normalize("NFC")
    .replace(/ѣ/giu, "е")
    .replace(/ъ(?!\p{L})/giu, "");
  return modern
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.,;]$/u, "");
}

function parse(text: string): ParsedDate | null {
  for (const [qualifier, words] of qualifiers) {
    if (words.test(text)) return one(qualifier, text.replace(words, ""));
  }
  if (betweenOpening.test(text)) {
    const two = text.replace(betweenOpening, "");
    return split(and, two, true) ?? split(range, two, false);
  }
  const bare = text.replace(preposition, "");
  return one("exact", text) ?? doubtful(text) ?? ofDecade(bare) ?? split(range, bare, false);
}

function one(qualifier: "exact" | "about" | "before" | "after", text: string): ParsedDate | null {
  const point = readPoint(text);
  return point && { qualifier, calendar: point.calendar, from: point.date };
}

/** "1885?" says no more than "about 1885". */
function doubtful(text: string): ParsedDate | null {
  const [, sure] = /^(.+?) ?(?:\?|\(\?\))$/u.exec(text) ?? [];
  return sure === undefined ? null : one("about", sure);
}

function ofDecade(text: string): ParsedDate | null {
  const [, tens] = decade.exec(text) ?? [];
  if (tens === undefined) return null;
  const first = Number(tens) * 10;
  const to = { year: first + 9 };
  return { qualifier: "between", calendar: "gregorian", from: { year: first }, to };
}

/** Reads two dates. `borrows` lets the first leave out what the second says: "5 and 10 May 1885". */
function split(by: RegExp, text: string, borrows: boolean): ParsedDate | null {
  const [first, second] = by.exec(text)?.slice(1).filter(Boolean) ?? [];
  if (first === undefined || second === undefined) return null;
  const left = readSide(first);
  const right = readSide(second);
  const from = left.date ?? (borrows ? completed(left.text, right.text) : null);
  const to = right.date;
  const calendar = right.calendar ?? "gregorian";
  const calendarOfFirst = left.calendar ?? (right.isAfter ? calendar : "gregorian");
  if (from === null || to === null || calendarOfFirst !== calendar) return null;
  return exists(from, calendar) && exists(to, calendar) && isNotLater(from, to)
    ? { qualifier: "between", calendar, from, to }
    : null;
}

function readPoint(text: string): Point | null {
  const { date, calendar = "gregorian" } = readSide(text);
  if (date === null) return inBothCalendars(text);
  return exists(date, calendar) ? { calendar, date } : null;
}

/**
 * One day written in both calendars: "1/13 May 1885", "20 April (2 May) 1885". It is read only when
 * the two are the same day, and kept as the Julian one.
 */
function inBothCalendars(text: string): Point | null {
  const pairs: [string, string][] = [];
  const numbers =
    /^(.*?)(?<![\d-])(\d{1,2}) ?(?:\/ ?(\d{1,2})|\((\d{1,2})\)|\[(\d{1,2})\])(?!\d)(.*)$/u;
  const [, before = "", a, slashed, round, square, after = ""] = numbers.exec(text) ?? [];
  if (a !== undefined) {
    const b = slashed ?? round ?? square ?? "";
    pairs.push([`${before}${a}${after}`, `${before}${b}${after}`]);
  }
  for (const { index } of text.matchAll(/\//gu)) {
    pairs.push([text.slice(0, index), text.slice(index + 1)]);
  }
  const brackets = /^([^([]+)(?:\(([^()]+)\)|\[([^[\]]+)\])(.*)$/u.exec(text);
  if (brackets) {
    const [, first = "", inRound, inSquare, rest = ""] = brackets;
    pairs.push([first, `${(inRound ?? inSquare ?? "").trim()}${rest}`]);
  }
  for (const [first, second] of pairs) {
    const left = readSide(first.trim());
    const right = readSide(second.trim());
    const one = left.date ?? completed(left.text, right.text);
    // A bare number after a whole date may be a note, an age or a number of a record.
    const isDay = right.calendar !== undefined || /[\p{L}.]/u.test(right.text);
    const other = right.date ?? (isDay ? completed(right.text, left.text) : null);
    if (one === null || other === null) continue;
    const isJulianFirst = left.calendar !== "gregorian" && right.calendar !== "julian";
    if (isJulianFirst && isSameDay(one, other)) return { calendar: "julian", date: one };
    const isJulianSecond = left.calendar !== "julian" && right.calendar !== "gregorian";
    if (isJulianSecond && isSameDay(other, one)) return { calendar: "julian", date: other };
  }
  return null;
}

function readSide(text: string): Side {
  for (const [calendar, mark] of calendars) {
    const found = mark.exec(text);
    if (found === null) continue;
    const rest = text.replace(mark, " ").replace(/\s+/gu, " ").trim();
    return { text: rest, date: readDate(rest), calendar, isAfter: found.index > 0 };
  }
  return { text, date: readDate(text), isAfter: false };
}

/** One of two dates with the end of the other: "5" of "5 and 10 May 1885" is "5 May 1885". */
function completed(text: string, other: string): PartialDate | null {
  for (const { index } of other.matchAll(/[ .]/gu)) {
    const date = readDate(text + other.slice(index));
    // A month and a year may be common to both, a day is not.
    if (date !== null && (date.day === undefined || /\d/u.test(text))) return date;
  }
  return null;
}

function readDate(text: string): PartialDate | null {
  const bare = text.replace(preposition, "");
  for (const [form, reader] of forms) {
    const date = reader(...(form.exec(bare)?.slice(1) ?? []));
    if (date !== null) return date;
  }
  return null;
}

/** The number of a day or a month, 0 for one nobody knows. */
function number(written: string | undefined): number {
  return /^\d+$/u.test(written ?? "") ? Number(written) : 0;
}

function inWords(y?: string, m?: string, d?: string): PartialDate | null {
  const month = m === undefined ? undefined : monthOf(m);
  return month === undefined ? null : build(y, month, number(d));
}

/** A day and a month, when only one of the two can be the month. */
function inOneOrder(first: number, second: number, y?: string): PartialDate | null {
  if (second > 12) return build(y, first, second);
  return first > 12 || first === second ? build(y, second, first) : null;
}

function build(y?: string, month = 0, day = 0): PartialDate | null {
  if (y === undefined || month > 12 || (month === 0 && day !== 0)) return null;
  const date: PartialDate = { year: Number(y) };
  if (month !== 0) date.month = month;
  if (day !== 0) date.day = day;
  return date;
}

function exists({ year, month, day }: PartialDate, calendar: Calendar): boolean {
  if (month === undefined || day === undefined) return true;
  const next = month === 12 ? { year: year + 1 } : { year, month: month + 1 };
  return day <= dayNumber(next, calendar) - dayNumber({ year, month }, calendar);
}

function isSameDay(julian: PartialDate, gregorian: PartialDate): boolean {
  return (
    julian.day !== undefined &&
    gregorian.day !== undefined &&
    exists(julian, "julian") &&
    exists(gregorian, "gregorian") &&
    dayNumber(julian, "julian") === dayNumber(gregorian, "gregorian")
  );
}

/** Compares the parts both dates have. */
function isNotLater(a: PartialDate, b: PartialDate): boolean {
  if (a.year !== b.year) return a.year < b.year;
  if (a.month === undefined || b.month === undefined) return true;
  if (a.month !== b.month) return a.month < b.month;
  return a.day === undefined || b.day === undefined || a.day <= b.day;
}

/** The Julian day number of the first day of a date. */
function dayNumber({ year, month = 1, day = 1 }: PartialDate, calendar: Calendar): number {
  // Years begin in March here, so the leap day is the last one.
  const isBeforeMarch = month < 3 ? 1 : 0;
  const y = year + 4800 - isBeforeMarch;
  const months = month + 12 * isBeforeMarch - 3;
  const days = day + Math.floor((153 * months + 2) / 5) + 365 * y + Math.floor(y / 4);
  return calendar === "julian"
    ? days - 32083
    : days - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
