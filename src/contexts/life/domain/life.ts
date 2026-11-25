import { type Write, writes } from "../../../kernel/change";
import { sortKey } from "../../../kernel/fuzzy-date";
import type { EventId, PersonId, PlaceId } from "../../../kernel/id";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import { type LifeEvent, versionedKinds } from "./event";

/** The events about one person, and where those of others are in which the person takes part. */
export type PersonLife = {
  id: PersonId;
  version: number;
  events: LifeEvent[];
  /** A mirror of the participants of events of others. */
  takesPart: { event: EventId; home: PersonId }[];
};

export type Change = Write<"life", PersonId, PersonLife>[];

export interface LifeReader {
  lifeOf(id: PersonId): PersonLife | null;
  /** How many events happened at a place. */
  countAt(place: PlaceId): number;
}

export type EventError =
  /** An event is about somebody. */
  | { code: "nobody" }
  /** An event stays with whom it is about: its citations hold to that person. */
  | { code: "another-subject" }
  | Duplicate
  | Missing;

/** Adds an event. Identifiers are random: a new one is not looked for at other people. */
export function addEvent(reader: LifeReader, event: LifeEvent): Result<Change, EventError> {
  const home = event.participants[0]?.person;
  if (home === undefined) return nobody;
  const { events, takesPart } = lifeOf(reader, home);
  const isThere = [...events.map(({ id }) => id), ...takesPart.map((one) => one.event)];
  if (isThere.includes(event.id) || hasTwice(event)) return duplicate;
  return {
    ok: true,
    value: changed(reader, home, withMains([...events, event], event), null, event),
  };
}

/** Replaces an event of the person it is believed to be about. */
export function editEvent(
  reader: LifeReader,
  home: PersonId,
  event: LifeEvent,
): Result<Change, EventError> {
  const old = eventOf(reader, home, event.id);
  if (old === null) return missing(event.id);
  const first = event.participants[0]?.person;
  if (first === undefined) return nobody;
  if (first !== home) return { ok: false, error: { code: "another-subject" } };
  if (hasTwice(event)) return duplicate;
  const { events } = lifeOf(reader, home);
  const all = events.map((one) => (one.id === event.id ? event : one));
  return { ok: true, value: changed(reader, home, withMains(all, event), old, event) };
}

/** Removes an event of the person it is believed to be about. */
export function removeEvent(
  reader: LifeReader,
  home: PersonId,
  id: EventId,
): Result<Change, Missing> {
  const event = eventOf(reader, home, id);
  if (event === null) return missing(id);
  const left = lifeOf(reader, home).events.filter((one) => one.id !== id);
  return { ok: true, value: changed(reader, home, withMains(left), event, null) };
}

export function eventOf(reader: LifeReader, home: PersonId, id: EventId): LifeEvent | null {
  return lifeOf(reader, home).events.find((one) => one.id === id) ?? null;
}

const nobody = { ok: false, error: { code: "nobody" } } as const;

/** Whether somebody stands twice in one role. */
function hasTwice({ participants }: LifeEvent): boolean {
  const roles = participants.map(({ person, role }) => JSON.stringify([person, role]));
  return new Set(roles).size < roles.length;
}

/** Every event a person takes part in by the first day, those without one last, as recorded. */
export function eventsOf(reader: LifeReader, id: PersonId): LifeEvent[] {
  const { events, takesPart } = lifeOf(reader, id);
  const others = takesPart.flatMap(({ event, home }) =>
    lifeOf(reader, home).events.filter((one) => one.id === event),
  );
  const dayOf = ({ date }: LifeEvent) => (date && sortKey(date)) ?? Number.MAX_SAFE_INTEGER;
  return [...events, ...others].sort((a, b) => dayOf(a) - dayOf(b));
}

/** The main version of the birth or of the death of a person. */
export function mainOf(
  reader: LifeReader,
  id: PersonId,
  kind: "birth" | "death",
): LifeEvent | null {
  return lifeOf(reader, id).events.find((one) => one.kind === kind && one.main) ?? null;
}

function lifeOf(reader: LifeReader, id: PersonId): PersonLife {
  return reader.lifeOf(id) ?? { id, version: 0, events: [], takesPart: [] };
}

/**
 * Leaves one main version of the birth and one of the death, if there are any: the one just recorded
 * if it says so, else the one that was, else the first of the others.
 */
function withMains(events: LifeEvent[], recorded?: LifeEvent): LifeEvent[] {
  const mains = versionedKinds.map((kind) => {
    const versions = events.filter((one) => one.kind === kind);
    if (recorded?.kind === kind && recorded.main) return recorded;
    return (
      versions.find(({ main }) => main) ?? versions.find((one) => one !== recorded) ?? versions[0]
    );
  });
  return events.map((one) => {
    const main = !versionedKinds.includes(one.kind) || mains.includes(one);
    return one.main === main ? one : { ...one, main };
  });
}

/** Gives a person their events, and those who take part in the one that differs where to find it. */
function changed(
  reader: LifeReader,
  home: PersonId,
  events: LifeEvent[],
  old: LifeEvent | null,
  now: LifeEvent | null,
): Change {
  const before = reader.lifeOf(home);
  const change: Change = writes("life", home, before, { ...lifeOf(reader, home), events });
  const id = (now ?? old)?.id;
  const [were, are] = [othersIn(old), othersIn(now)];
  for (const other of new Set([...were, ...are])) {
    if (id === undefined || were.has(other) === are.has(other)) continue;
    const life = lifeOf(reader, other);
    const others = life.takesPart.filter(({ event }) => event !== id);
    const takesPart = are.has(other) ? [...others, { event: id, home }] : others;
    change.push(...writes("life", other, reader.lifeOf(other), { ...life, takesPart }));
  }
  return change;
}

/** Those who take part in an event of somebody else. */
function othersIn(event: LifeEvent | null): Set<PersonId> {
  const [home, ...others] = event?.participants.map(({ person }) => person) ?? [];
  return new Set(others.filter((person) => person !== home));
}
