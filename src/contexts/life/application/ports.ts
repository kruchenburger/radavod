import type { Change, LifeReader } from "../domain/life";

/** Where events are kept. It reads what was saved before, and counts the versions. */
export interface LifeStore extends LifeReader {
  save(change: Change): void;
}
