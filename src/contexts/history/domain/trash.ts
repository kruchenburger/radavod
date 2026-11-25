import type { BranchId, MemberId, PersonId, UnionId } from "../../../kernel/id";

/**
 * A person in the trash with everything that tied them to others. What belongs to other contexts is kept
 * as they gave it and is theirs to read: `unknown` here is only carried.
 */
export type Trashed = {
  id: PersonId;
  version: number;
  at: number;
  by: MemberId;
  /** What was written about the person, with the parents. */
  person: unknown;
  branch: BranchId | null;
  children: TrashedChild[];
  unions: TrashedUnion[];
  /** Events about the person. */
  events: unknown[];
  /** Events of others the person took part in, and in what roles. */
  guest: TrashedGuest[];
  citations: unknown[];
};

export type TrashedChild = { child: PersonId; parentage: unknown };
export type TrashedGuest = { home: PersonId; event: string; roles: string[] };
export type TrashedUnion = {
  id: UnionId;
  union: unknown;
  branch: BranchId | null;
  citations: unknown[];
  /** Whose parentages were of the union. */
  children: { child: PersonId; parentage: string }[];
};

/** The trash of a family. */
export interface Trash {
  get(id: PersonId): Trashed | null;
  put(id: PersonId, trashed: Trashed | null): void;
  everybody(): Trashed[];
}
