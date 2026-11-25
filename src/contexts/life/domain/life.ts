import { type Write, writes } from "../../../kernel/change";
import { sortKey } from "../../../kernel/fuzzy-date";
import type { EventId, PersonId } from "../../../kernel/id";
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
  /** Whom an event is about. */
  homeOf(event: EventId): PersonId | null;
}

export type EventError =
  /** An event is about somebody. */
  | { code: "nobody" }
  /** An event stays with whom it is about: its citations hold to that person. */
  | { code: "another-subject" }
  | Duplicate
  | Missing;

/** Adds an event or replaces the one with its identifier. */
export function recordEvent(reader: LifeReader, event: LifeEvent): Result<Change, EventError> {
  const home = event.participants[0]?.person;
  if (home === undefined) return { ok: false, error: { code: "nobody" } };
  const roles = event.participants.map(({ person, role }) => JSON.stringify([person, role]));
  if (new Set(roles).size < roles.length) return duplicate;
  const oldHome = reader.homeOf(event.id);
  if (oldHome !== null && oldHome !== home) {
    return { ok: false, error: { code: "another-subject" } };
  }
  const { events } = lifeOf(reader, home);
  const old = events.find(({ id }) => id === event.id);
  const all = old ? events.map((one) => (one === old ? event : one)) : [...events, event];
  return { ok: true, value: changed(reader, home, withMains(all, event), old, event) };
}

export function removeEvent(reader: LifeReader, id: EventId): Result<Change, Missing> {
  const event = eventOf(reader, id);
  const home = event?.participants[0]?.person;
  if (event === null || home === undefined) return missing(id);
  const left = lifeOf(reader, home).events.filter((one) => one.id !== id);
  return { ok: true, value: changed(reader, home, withMains(left), event, undefined) };
}

export function eventOf(reader: LifeReader, id: EventId): LifeEvent | null {
  const home = reader.homeOf(id);
  return home && (lifeOf(reader, home).events.find((one) => one.id === id) ?? null);
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
): LifeEvent | undefined {
  return lifeOf(reader, id).events.find((one) => one.kind === kind && one.main);
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
    if (!versionedKinds.includes(one.kind)) return one;
    const main = mains.includes(one);
    return one.main === main ? one : { ...one, main };
  });
}

/** Gives a person their events, and those who take part in the one that differs where to find it. */
function changed(
  reader: LifeReader,
  home: PersonId,
  events: LifeEvent[],
  old: LifeEvent | undefined,
  now: LifeEvent | undefined,
): Change {
  const before = reader.lifeOf(home);
  const change: Change = writes("life", home, before, { ...lifeOf(reader, home), events });
  const id = (now ?? old)?.id;
  const [were, are] = [guestsOf(old), guestsOf(now)];
  for (const guest of new Set([...were, ...are])) {
    if (id === undefined || were.has(guest) === are.has(guest)) continue;
    const life = lifeOf(reader, guest);
    const others = life.takesPart.filter(({ event }) => event !== id);
    const takesPart = are.has(guest) ? [...others, { event: id, home }] : others;
    change.push(...writes("life", guest, reader.lifeOf(guest), { ...life, takesPart }));
  }
  return change;
}

/** Those who take part in an event of somebody else. */
function guestsOf(event: LifeEvent | undefined): Set<PersonId> {
  const [home, ...others] = event?.participants.map(({ person }) => person) ?? [];
  return new Set(others.filter((person) => person !== home));
}
