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
    record(event) {
      const { participants, place, union } = event;
      const stranger = participants.find(({ person }) => kinship.get(person) === null);
      if (stranger !== undefined) return missing(stranger.person);
      if (place !== null && places.get(place) === null) return missing(place);
      if (union !== null && kinship.union(union) === null) return missing(union);
      return saved(recordEvent(store, event));
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
