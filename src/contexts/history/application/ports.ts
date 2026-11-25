import type { Entry } from "../domain/entry";

/** Where the journal is kept. Entries are only added. */
export interface JournalStore {
  /** The number of the last entry, 0 when there is none. */
  last(): number;
  append(entry: Entry): void;
  entry(number: number): Entry | null;
  numbersOf(subject: string): number[];
  putNumbers(subject: string, numbers: number[]): void;
}
