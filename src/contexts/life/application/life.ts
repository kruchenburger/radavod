import type { EventId, PersonId } from "../../../kernel/id";
import { missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import { descends, type Kinship } from "../../kinship";
import type { Places } from "../../places";
import type { LifeEvent } from "../domain/event";
import {
  type Change,
  type EventError,
  eventOf,
  eventsOf,
  mainOf,
  recordEvent,
  removeEvent,
} from "../domain/life";
import { type Descent, type Warning, warningsOf } from "../domain/warnings";
import type { LifeStore } from "./ports";

export type LifeError = EventError;

/** A command that is refused or changes nothing is not stored. */
export interface Life {
  event(id: EventId): LifeEvent | null;
  /** Every event a person takes part in, by date. */
  eventsOf(id: PersonId): LifeEvent[];
  /** The main version of the birth or of the death of a person. */
  main(id: PersonId, kind: "birth" | "death"): LifeEvent | null;
  /** Adds an event or replaces the one with its identifier. */
  record(event: LifeEvent): Result<Change, LifeError>;
  remove(id: EventId): Result<Change, LifeError>;
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
  return {
    event: (id) => eventOf(store, id),
    eventsOf: (id) => eventsOf(store, id),
    main: (id, kind) => mainOf(store, id, kind),
    record(event) {
      // What an event named before may have gone since. That does not stop an edit of the rest.
      const old = eventOf(store, event.id);
      const known = old?.participants.map(({ person }) => person) ?? [];
      const { participants, place, union } = event;
      const stranger = participants.find(
        ({ person }) => !known.includes(person) && kinship.get(person) === null,
      );
      if (stranger !== undefined) return missing(stranger.person);
      if (place !== null && place !== old?.place && places.get(place) === null) {
        return missing(place);
      }
      if (union !== null && union !== old?.union && kinship.union(union) === null) {
        return missing(union);
      }
      return saved(recordEvent(store, event, old));
    },
    remove: (id) => saved(removeEvent(store, id)),
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
