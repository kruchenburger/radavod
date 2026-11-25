/** `<kind>_` and 22 characters of base58, made outside the domain and passed in. */
export type Id<K extends string> = string & { readonly kind: K };

/** 22 characters of base58: no 0, O, I and l. */
const base58 = /^[1-9A-HJ-NP-Za-km-z]{22}$/;

export function isId<K extends string>(kind: K, value: unknown): value is Id<K> {
  if (typeof value !== "string" || !value.startsWith(`${kind}_`)) return false;
  return base58.test(value.slice(kind.length + 1));
}

/** Stands in the journal where somebody erased was. */
export const ERASED = "erased";

export type PersonId = Id<"person">;
export type UnionId = Id<"union">;
export type EventId = Id<"event">;
export type PlaceId = Id<"place">;
export type SourceId = Id<"source">;
export type CitationId = Id<"citation">;
export type BranchId = Id<"branch">;
export type MemberId = Id<"member">;

/** A fact for those who do not own it: "name:<id>", "parentage:<id>", "event:<id>" or "union". */
export type FactRef = { subject: PersonId | UnionId; fact: string };
