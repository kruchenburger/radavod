import type { Certainty } from "../../../kernel/certainty";
import type { FuzzyDate } from "../../../kernel/fuzzy-date";
import type { EventId, PersonId, PlaceId, UnionId } from "../../../kernel/id";

/** A kind of one's own is "other" with a title. */
export type EventKind =
  | "birth"
  | "baptism"
  | "wedding"
  | "divorce"
  | "residence"
  | "service"
  | "occupation"
  | "emigration"
  | "repression"
  | "death"
  | "burial"
  | "other";

export type LifeEvent = {
  id: EventId;
  kind: EventKind;
  /** What the family calls it: the occupation, the kind that is not in the list. */
  title: string;
  date: FuzzyDate | null;
  place: PlaceId | null;
  /** The first is whom the event is about. */
  participants: { person: PersonId; role: string }[];
  union: UnionId | null;
  /** False for a version of a birth or a death that is not the main one. Other kinds have no versions. */
  main: boolean;
  certainty: Certainty;
  note: string;
};

/** Of a birth and of a death there may be versions. */
export const versionedKinds: readonly EventKind[] = ["birth", "death"];
