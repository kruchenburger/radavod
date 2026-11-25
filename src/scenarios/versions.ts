import { type Entry, journalOver, sqliteCheckpoints, sqliteJournal } from "../contexts/history";
import { type Missing, missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import { reverse, type State } from "../shared/reverse";
import type { UnitOfWork } from "./unit-of-work";

export interface Versions {
  /** Entries from the last one back, or from the one before a number, with the names of versions. */
  entries(page: { before?: number; limit: number }): (Entry & { title: string | null })[];
  /** Names the version after an entry. An empty title takes the name away. */
  name(number: number, title: string): Result<number, Missing>;
  /** What was written in the tree after an entry, null when there is none. */
  at(number: number): Promise<State | null>;
  /** Keeps the state of now, so that old versions are built from near by. It is never needed. */
  checkpoint(): Promise<void>;
  isCheckpointDue(): boolean;
  /** Entries are counted anew after a rollback of the database: numbers hold within an epoch. */
  epoch(): string;
  renewEpoch(epoch: string): void;
}

const checkpointEvery = 500;

export function versionsOf(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
  unit: UnitOfWork,
): Versions {
  const journal = journalOver(sqliteJournal(storage.sql));
  const checkpoints = sqliteCheckpoints(storage.sql);
  return {
    entries: (page) =>
      journal.entries(page).map((entry) => ({ ...entry, title: journal.titleOf(entry.number) })),
    name(number, title) {
      if (journal.entry(number) === null) return missing(String(number));
      journal.name(number, title);
      return { ok: true, value: number };
    },
    async at(number) {
      const last = journal.last();
      if (!Number.isInteger(number) || number < 0 || number > last) return null;
      const entriesFrom = (from: number) =>
        Array.from({ length: from - number }, (_, i) => journal.entry(from - i)).filter(
          (entry) => entry !== null,
        );
      const kept = checkpoints.from(number);
      if (kept !== null) {
        // The entries are read before the wait, so they are of the moment of the checkpoint.
        const entries = entriesFrom(kept.number);
        const state = await unpack(kept.data);
        if (state !== null) return reverse(state, entries);
      }
      return number > journal.last()
        ? null
        : reverse(
            unit.read((c) => c.history.state()),
            entriesFrom(journal.last()),
          );
    },
    async checkpoint() {
      const number = journal.last();
      const erasures = checkpoints.erasures();
      const state = unit.read((c) => c.history.state());
      const data = await pack(state);
      // Somebody erased while it was packed would be in it.
      storage.transactionSync(() => {
        if (checkpoints.erasures() === erasures) checkpoints.put(number, data);
      });
    },
    isCheckpointDue: () => journal.last() - checkpoints.last() >= checkpointEvery,
    epoch: () => checkpoints.epoch(),
    renewEpoch: (epoch) => checkpoints.renewEpoch(epoch),
  };
}

async function pack(state: State): Promise<Uint8Array> {
  const stream = new Response(JSON.stringify(state)).body?.pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The state in a checkpoint, or null if it cannot be read: there is another way to it. */
async function unpack(data: Uint8Array): Promise<State | null> {
  try {
    const stream = new Response(data).body?.pipeThrough(new DecompressionStream("gzip"));
    return (await new Response(stream).json()) as State;
  } catch {
    return null;
  }
}
