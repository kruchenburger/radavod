import type { EventId, PersonId, PlaceId } from "../../../kernel/id";
import { missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import { descends, type Kinship } from "../../kinship";
import type { Places } from "../../places";
import type { LifeEvent } from "../domain/event";
import {
  addEvent,
  type Change,
  editEvent,
  type EventError,
  eventOf,
  eventsOf,
  mainOf,
  removeEvent,
} from "../domain/life";
import { type Descent, type Warning, warningsOf } from "../domain/warnings";
import type { LifeStore } from "./ports";

export type LifeError = EventError;

/**
 * A command that is refused or changes nothing is not stored. An event is asked for and changed at the
 * person it is about.
 */
export interface Life {
  event(home: PersonId, id: EventId): LifeEvent | null;
  /** Every event a person takes part in, by date. */
  eventsOf(id: PersonId): LifeEvent[];
  /** The main version of the birth or of the death of a person. */
  main(id: PersonId, kind: "birth" | "death"): LifeEvent | null;
  /** How many events happened at a place. It looks at them all. */
  countAt(place: PlaceId): number;
  add(event: LifeEvent): Result<Change, LifeError>;
  edit(home: PersonId, event: LifeEvent): Result<Change, LifeError>;
  remove(home: PersonId, id: EventId): Result<Change, LifeError>;
  /** What is odd about a person. It blocks nothing. */
  warnings(id: PersonId): Warning[];
}

export function lifeOver(
  store: LifeStore,
  kinship: Pick<Kinship, "get" | "union">,
  places: Pick<Places, "get">,
): Life {
  const saved = (result: Result<Change, LifeError>) => {
    if (result.ok && result.value.length > 0) store.save(result.value);
    return result;
  };
  /** The first thing an event names that is not there, unless it named it before. */
  const lost = ({ participants, place, union }: LifeEvent, old: LifeEvent | null) => {
    const known = old?.participants.map(({ person }) => person) ?? [];
    const stranger = participants.find(
      ({ person }) => !known.includes(person) && kinship.get(person) === null,
    );
    if (stranger !== undefined) return stranger.person;
    if (place !== null && place !== old?.place && places.get(place) === null) return place;
    if (union !== null && union !== old?.union && kinship.union(union) === null) return union;
    return null;
  };
  return {
    event: (home, id) => eventOf(store, home, id),
    eventsOf: (id) => eventsOf(store, id),
    main: (id, kind) => mainOf(store, id, kind),
    countAt: (place) => store.countAt(place),
    add(event) {
      const id = lost(event, null);
      return id === null ? saved(addEvent(store, event)) : missing(id);
    },
    edit(home, event) {
      // What an event named before may have gone since. That does not stop an edit of the rest.
      const id = lost(event, eventOf(store, home, event.id));
      return id === null ? saved(editEvent(store, home, event)) : missing(id);
    },
    remove: (home, id) => saved(removeEvent(store, home, id)),
    warnings: (id) => warningsOf(store, id, descentsOf(kinship, id)),
  };
}

/** A person with each parent and each child by blood or adoption, versions included. */
function descentsOf(kinship: Pick<Kinship, "get">, id: PersonId): Descent[] {
  const parentsOf = (child: PersonId): PersonId[] => {
    const links = kinship.get(child)?.parents ?? [];
    const parents = links.flatMap((link) =>
      link.parent !== "unknown" && descends(link) ? [link.parent] : [],
    );
    return [...new Set(parents)];
  };
  const children = kinship.get(id)?.children ?? [];
  return [
    ...parentsOf(id).map((parent) => ({ parent, child: id })),
    ...children
      .filter((child) => parentsOf(child).includes(id))
      .map((child) => ({ parent: id, child })),
  ];
}
