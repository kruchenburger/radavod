import type { Certainty } from "../../../kernel/certainty";
import type { FuzzyDate } from "../../../kernel/fuzzy-date";
import type { EventId, FactRef, PersonId, PlaceId, UnionId } from "../../../kernel/id";

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
  /** False for a version of a birth or a death that is not the main one. */
  main: boolean;
  certainty: Certainty;
  note: string;
};

/** Of a birth and of a death there may be versions. */
export const versionedKinds: readonly EventKind[] = ["birth", "death"];

const prefix = "event:";

/** An event as a fact others cite and give a certainty: of the person it is about. */
export function factOf({ id, participants }: LifeEvent): FactRef {
  const [home] = participants;
  // An event is never without whom it is about.
  if (home === undefined) throw new Error("nobody");
  return { subject: home.person, fact: `${prefix}${id}` };
}

/** Where to find the event a fact is, if it is one. */
export function eventOf({ subject, fact }: FactRef): { home: PersonId; id: EventId } | null {
  if (!fact.startsWith(prefix) || !subject.startsWith("person_")) return null;
  return { home: subject as PersonId, id: fact.slice(prefix.length) as EventId };
}
