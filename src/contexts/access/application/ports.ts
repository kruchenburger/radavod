import type { AccessReader, Change } from "../domain/member";

/** Where the access of a family is kept. It reads what was saved before. */
export interface AccessStore extends AccessReader {
  save(change: Change): void;
}
