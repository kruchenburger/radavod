import type { Change, PlaceReader } from "../domain/place";

/** Where places are kept. It reads what was saved before, and counts the versions. */
export interface PlacesStore extends PlaceReader {
  save(change: Change): void;
}
