import type { MemberId } from "../../../kernel/id";
import { type Changed, type Entry, patchesOf, subjectsOf } from "../domain/entry";
import type { JournalStore } from "./ports";

/** Who changed something, when and by what scenario. */
export type Act = { actor: MemberId; now: number; scenario: string };

export interface Journal {
  /** The number of the last entry, 0 when there is none. */
  last(): number;
  /** The number of the next entry. */
  next(): number;
  /** Writes one entry for everything that one scenario changed. */
  write(number: number, act: Act, changed: readonly Changed[]): void;
  entry(number: number): Entry | null;
  /** Entries from the last one back, or from the one before a number. */
  entries(page: { before?: number; limit: number }): Entry[];
  /** The numbers of the entries about something, from the first one. */
  entriesOf(subject: string): number[];
  /** The name of the version after an entry. */
  titleOf(number: number): string | null;
  /** Names the version after an entry. An empty title takes the name away. */
  name(number: number, title: string): void;
}

/** An entry of more subjects, as an import, is found by looking into it. */
const manySubjects = 100;

export function journalOver(store: JournalStore): Journal {
  return {
    last: () => store.last(),
    next: () => store.last() + 1,
    write(number, { actor, now, scenario }, changed) {
      const told = changed.map((one) => ({ one, patches: patchesOf(one) }));
      const patches = told.flatMap((each) => each.patches);
      store.append({ number, at: now, by: actor, scenario, patches });
      const subjects = new Set(told.flatMap((each) => subjectsOf(each.one, each.patches)));
      if (subjects.size > manySubjects) {
        store.putBulk(number);
        return;
      }
      for (const subject of subjects) {
        store.putNumbers(subject, [...store.numbersOf(subject), number]);
      }
    },
    entry: (number) => store.entry(number),
    entries({ before = store.last() + 1, limit }) {
      const last = Math.min(before - 1, store.last());
      const count = Math.max(Math.min(limit, last), 0);
      return Array.from({ length: count }, (_, i) => store.entry(last - i)).filter(
        (entry) => entry !== null,
      );
    },
    entriesOf: (subject) =>
      [...store.numbersOf(subject), ...store.bulksOf(subject)].sort((a, b) => a - b),
    titleOf: (number) => store.titleOf(number),
    name: (number, title) => store.putTitle(number, title),
  };
}
