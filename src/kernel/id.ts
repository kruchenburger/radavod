/** `<kind>_` and 22 characters of base58, made outside the domain and passed in. */
export type Id<K extends string> = string & { readonly kind: K };

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
