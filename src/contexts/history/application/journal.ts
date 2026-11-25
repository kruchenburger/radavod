import type { MemberId } from "../../../kernel/id";
import { type Changed, type Entry, patchesOf, subjectsOf } from "../domain/entry";
import type { JournalStore } from "./ports";

/** Who changed something, when and by what scenario. */
export type Act = { actor: MemberId; now: number; scenario: string };

export interface Journal {
  /** The number of the next entry. */
  next(): number;
  /** Writes one entry for everything that one scenario changed. */
  write(number: number, act: Act, changed: readonly Changed[]): void;
  entry(number: number): Entry | null;
  /** The numbers of the entries about something, from the first one. */
  entriesOf(subject: string): number[];
}

export function journalOver(store: JournalStore): Journal {
  return {
    next: () => store.last() + 1,
    write(number, { actor, now, scenario }, changed) {
      const patches = changed.flatMap(patchesOf);
      store.append({ number, at: now, by: actor, scenario, patches });
      for (const subject of new Set(changed.flatMap(subjectsOf))) {
        store.putNumbers(subject, [...store.numbersOf(subject), number]);
      }
    },
    entry: (number) => store.entry(number),
    entriesOf: (subject) => store.numbersOf(subject),
  };
}
