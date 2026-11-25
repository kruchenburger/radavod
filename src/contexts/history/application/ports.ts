import type { Entry } from "../domain/entry";

/** Where the journal is kept. Entries are only added. */
export interface JournalStore {
  /** The number of the last entry, 0 when there is none. */
  last(): number;
  append(entry: Entry): void;
  entry(number: number): Entry | null;
  numbersOf(subject: string): number[];
  putNumbers(subject: string, numbers: number[]): void;
  /** Keeps the number of an entry of so many things that it is not written with each. */
  putBulk(number: number): void;
  /** The entries of many things that name a subject. */
  bulksOf(subject: string): number[];
  titleOf(number: number): string | null;
  putTitle(number: number, title: string): void;
}
