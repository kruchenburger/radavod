import { type Write, writes } from "../../../kernel/change";
import { type FuzzyDate, lastDay, sortKey } from "../../../kernel/fuzzy-date";
import type { PlaceId } from "../../../kernel/id";
import type { Language } from "../../../kernel/name-form";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";

/** A place with what it was called and what it belonged to. A null period is one nobody knows. */
export type Place = {
  id: PlaceId;
  version: number;
  names: { text: string; language: Language; period: Period | null }[];
  affiliations: { name: string; period: Period | null }[];
  coordinates: { lat: number; lon: number } | null;
};

/** Both ends belong to it. A null end is open. */
export type Period = { from: FuzzyDate | null; to: FuzzyDate | null };

export type NewPlace = Omit<Place, "version">;
export type PlacePatch = Partial<Omit<Place, "id" | "version">>;
export type Change = Write<"place", PlaceId, Place>[];

export interface PlaceReader {
  place(id: PlaceId): Place | null;
}

export function addPlace(reader: PlaceReader, place: NewPlace): Result<Change, Duplicate> {
  if (reader.place(place.id) !== null) return duplicate;
  return { ok: true, value: writes("place", place.id, null, { ...place, version: 0 }) };
}

export function editPlace(
  reader: PlaceReader,
  id: PlaceId,
  patch: PlacePatch,
): Result<Change, Missing> {
  const place = reader.place(id);
  if (place === null) return missing(id);
  return { ok: true, value: writes("place", id, place, { ...place, ...patch }) };
}

/**
 * What a place was called on a date, in the language asked for if it had such a name then. If none is
 * known of that time, it is the nearest one, and without a date the latest. Null when the place has no
 * name.
 */
export function nameOn(
  { names }: Place,
  date: FuzzyDate | null,
  language: Language,
): string | null {
  const when = date && spanOf(date);
  const known = when === null ? latest(names) : during(names, when);
  const choice = when !== null && known.length === 0 ? nearest(names, when) : known;
  const name = choice.find((one) => one.language === language) ?? choice[0];
  return name?.text ?? null;
}

/** What a place belonged to on a date. Null when nobody knows of that time. */
export function affiliationOn({ affiliations }: Place, date: FuzzyDate | null): string | null {
  const when = date && spanOf(date);
  return when === null ? null : (during(affiliations, when)[0]?.name ?? null);
}

type Dated = { period: Period | null };
/** Days from and to, both in it. A null end is open. */
type Span = { from: number | null; to: number | null };

/** The days a date may be. What was before 1918 was not in 1918. Null for an unread date. */
function spanOf(date: FuzzyDate): Span | null {
  const { text, parsed } = date;
  if (parsed === null) return null;
  const named: FuzzyDate = { text, parsed: { ...parsed, qualifier: "exact" } };
  const [from, to] = [sortKey(named), lastDay(named)];
  if (from === null || to === null) return null;
  if (parsed.qualifier === "before") return { from: null, to: from - 1 };
  if (parsed.qualifier === "after") return { from: to + 1, to: null };
  return { from, to };
}

/**
 * The days of a period, a year at either end whole. One that began "before 1922" counts from the last
 * day of 1921, and one that ended "after 1918" to the last day of 1918: more nobody knows.
 */
function periodOf({ period }: Dated): Span {
  const start = period?.from ? spanOf(period.from) : null;
  const end = period?.to ? spanOf(period.to) : null;
  const from = start && (start.from ?? start.to);
  const to = end && (end.to ?? (end.from === null ? null : end.from - 1));
  // It began no later than it ended: "before 1922" and to 1918 is before 1918 was over.
  return { from: from !== null && to !== null ? Math.min(from, to) : from, to };
}

/**
 * What held on the first day of a span, the best first, then what began later in it, the first first.
 * "Before" has no first day and goes by the last one; nobody knows what is still within "after".
 */
function during<T extends Dated>(list: readonly T[], { from, to }: Span): T[] {
  const day = from ?? to ?? 0;
  const held = list.filter((one) => distance(periodOf(one), day) === 0);
  const began = list.filter((one) => {
    const start = periodOf(one).from;
    return start !== null && to !== null && day < start && start <= to;
  });
  return [
    ...held.toSorted((a, b) => later(periodOf(a), periodOf(b))),
    ...began.toSorted((a, b) => later(periodOf(b), periodOf(a))),
  ];
}

/** Everything, what has not ended first. */
function latest<T extends Dated>(list: readonly T[]): T[] {
  const hasEnded = ({ period }: T) => Number((period?.to ?? null) !== null);
  return list.toSorted((a, b) => hasEnded(a) - hasEnded(b) || later(periodOf(a), periodOf(b)));
}

function nearest<T extends Dated>(list: readonly T[], { from, to }: Span): T[] {
  const day = from ?? to ?? 0;
  return list.toSorted((a, b) => distance(periodOf(a), day) - distance(periodOf(b), day));
}

/** How many days a day is from a period. */
function distance({ from, to }: Span, day: number): number {
  return Math.max((from ?? day) - day, day - (to ?? day), 0);
}

/** The later beginning first, then what has a beginning or an end at all. */
function later(a: Span, b: Span): number {
  const start = ({ from }: Span) => from ?? Number.MIN_SAFE_INTEGER;
  const isKnown = ({ from, to }: Span) => Number(from !== null || to !== null);
  return start(b) - start(a) || isKnown(b) - isKnown(a);
}
