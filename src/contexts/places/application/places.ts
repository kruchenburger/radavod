import type { FuzzyDate } from "../../../kernel/fuzzy-date";
import type { PlaceId } from "../../../kernel/id";
import type { Language } from "../../../kernel/name-form";
import type { Duplicate, Missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import {
  addPlace,
  affiliationOn,
  type Change,
  editPlace,
  nameOn,
  type NewPlace,
  type Place,
  type PlacePatch,
} from "../domain/place";
import type { PlacesStore } from "./ports";

/** A command that is refused or changes nothing is not stored. */
export interface Places {
  get(id: PlaceId): Place | null;
  add(place: NewPlace): Result<Change, Duplicate>;
  edit(id: PlaceId, patch: PlacePatch): Result<Change, Missing>;
  /** What a place was called on a date. Null for a place without names and for one not there. */
  nameOn(id: PlaceId, date: FuzzyDate | null, language: Language): string | null;
  /** What a place belonged to on a date. */
  affiliationOn(id: PlaceId, date: FuzzyDate | null): string | null;
}

export function placesOver(store: PlacesStore): Places {
  const saved = <E extends { code: string }>(result: Result<Change, E>) => {
    if (result.ok && result.value.length > 0) store.save(result.value);
    return result;
  };
  return {
    get: (id) => store.place(id),
    add: (place) => saved(addPlace(store, place)),
    edit: (id, patch) => saved(editPlace(store, id, patch)),
    nameOn(id, date, language) {
      const place = store.place(id);
      return place && nameOn(place, date, language);
    },
    affiliationOn(id, date) {
      const place = store.place(id);
      return place && affiliationOn(place, date);
    },
  };
}
