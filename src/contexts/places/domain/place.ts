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
 * What a place was called on a date, in the language asked for if it had such a name then. Where
 * periods meet, the later name wins, and a name of an unknown period gives way. Without a date it is
 * the latest name; if none is known of that time, the first one. Null when the place has no name.
 */
export function nameOn(
  { names }: Place,
  date: FuzzyDate | null,
  language: Language,
): string | null {
  const day = dayOf(date);
  const known = day === null ? latest(names) : at(names, day);
  const name = known.find((one) => one.language === language) ?? known[0] ?? names[0];
  return name?.text ?? null;
}

/** What a place belonged to on a date, chosen as its name is. Null when nobody knows. */
export function affiliationOn({ affiliations }: Place, date: FuzzyDate | null): string | null {
  const day = dayOf(date);
  return day === null ? null : (at(affiliations, day)[0]?.name ?? null);
}

type Dated = { period: Period | null };
type Span = { from: number | null; to: number | null };

function dayOf(date: FuzzyDate | null): number | null {
  return date && (sortKey(date) ?? lastDay(date));
}

function spanOf({ period }: Dated): Span {
  return {
    from: period?.from ? sortKey(period.from) : null,
    to: period?.to ? lastDay(period.to) : null,
  };
}

/** What holds on a day, the best first. */
function at<T extends Dated>(list: readonly T[], day: number): T[] {
  const holds = list.filter((one) => {
    const { from, to } = spanOf(one);
    return (from === null || from <= day) && (to === null || day <= to);
  });
  return holds.toSorted((a, b) => later(spanOf(a), spanOf(b)));
}

/** Everything, what has not ended first. */
function latest<T extends Dated>(list: readonly T[]): T[] {
  const hasEnded = (one: T) => Number(spanOf(one).to !== null);
  return list.toSorted((a, b) => hasEnded(a) - hasEnded(b) || later(spanOf(a), spanOf(b)));
}

/** The later beginning first, then what has a beginning or an end at all. */
function later(a: Span, b: Span): number {
  const start = ({ from }: Span) => from ?? Number.MIN_SAFE_INTEGER;
  const isKnown = ({ from, to }: Span) => Number(from !== null || to !== null);
  return start(b) - start(a) || isKnown(b) - isKnown(a);
}
