import { type Evidence, evidenceOver, sqliteEvidence } from "../contexts/evidence";
import {
  type Act,
  aggregateOf,
  type Journal,
  journalOver,
  sqliteJournal,
  sqliteTrash,
  type Trash,
} from "../contexts/history";
import { type Kinship, kinshipOver, sqliteKinship } from "../contexts/kinship";
import { type Life, lifeOver, sqliteLife } from "../contexts/life";
import { type Places, placesOver, sqlitePlaces } from "../contexts/places";
import type { Result } from "../kernel/result";
import type { State } from "../shared/reverse";
import type { Kept, Written } from "../shared/rows";

export type Contexts = {
  kinship: Kinship;
  places: Places;
  evidence: Evidence;
  life: Life;
  history: History;
};

/** The journal and what somebody wrote in the tree, as the journal tells it. */
export type History = Pick<Journal, "last" | "entry" | "entries" | "entriesOf"> & {
  /** What was written in an aggregate, as "kind/id", null when it is not there. */
  authored(aggregate: string): unknown;
  /** Everything that was written. It reads every row. */
  state(): State;
  trash: Trash;
};

/** What can be asked without a change. */
export type Reading = {
  kinship: Pick<Kinship, "get" | "union" | "branch" | "relatives">;
  places: Pick<Places, "get" | "nameOn" | "affiliationOn">;
  evidence: Pick<Evidence, "source" | "citationsOf" | "countFor">;
  life: Pick<Life, "event" | "eventsOf" | "main" | "countAt" | "warnings">;
  history: Omit<History, "trash"> & { trash: Pick<Trash, "get" | "everybody"> };
};

export type Command = Act & {
  /**
   * What the editor saw, by aggregate as "person/<id>": its version, 0 when it was not there. For
   * "person-branch/<id>" and "union-branch/<id>" it is the branch or null.
   */
  expected: Record<string, number | string | null>;
};

/** An aggregate and the number of the entry that changed it. */
export type Changed = { aggregate: string; version: number };

export type StaleVersion = {
  code: "stale-version";
  aggregate: string;
  current: number | string | null;
};

export type Telling = {
  /** What the entry tells of what was written. */
  tell: (written: readonly Written[]) => Written[];
  /** Comes last in the transaction, after the entry is written. */
  last: (sql: SqlStorage) => void;
};

export interface UnitOfWork {
  /**
   * Runs one scenario in one transaction with one journal entry. Commands see what earlier ones of
   * the same scenario did, and everything is written at the end. A refused scenario writes nothing,
   * one that changes nothing writes no entry. A scenario does not run inside another.
   */
  run<T, E extends { code: string }>(
    command: Command,
    work: (contexts: Contexts) => Result<T, E>,
    /** For what must not be told in the journal as it is. */
    telling?: Telling,
  ): Result<{ value: T; changed: Changed[] }, E | StaleVersion>;
  /** What a scenario would answer. Nothing of it is kept. */
  preview<T, E extends { code: string }>(work: (contexts: Contexts) => Result<T, E>): Result<T, E>;
  read<T>(work: (contexts: Reading) => T): T;
}

export function unitOfWork(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
  /** Told after a scenario changed the tree, once its transaction is over. */
  onChange: (version: number) => void = () => {},
): UnitOfWork {
  let isOpen = false;
  /** The contexts of a scenario do not see what another one has not written yet. */
  const alone = <T>(work: () => T): T => {
    if (isOpen) throw new Error("nested-scenario");
    isOpen = true;
    try {
      return work();
    } finally {
      isOpen = false;
    }
  };
  return {
    run<T, E extends { code: string }>(
      command: Command,
      work: (contexts: Contexts) => Result<T, E>,
      telling?: Telling,
    ) {
      const done = alone(() =>
        storage.transactionSync((): Result<{ value: T; changed: Changed[] }, E | StaleVersion> => {
          const { kept, contexts, journal } = open(storage.sql);
          for (const [aggregate, seen] of Object.entries(command.expected)) {
            const current = currentOf(kept, aggregate);
            if (current !== seen) {
              return { ok: false, error: { code: "stale-version", aggregate, current } };
            }
          }
          const result = work(contexts);
          if (!result.ok) return result;

          const version = journal.next();
          const written = kept.flatMap((one) => one.flush(version));
          const told = telling ? telling.tell(written) : written;
          if (written.length > 0) journal.write(version, command, told);
          telling?.last(storage.sql);
          const changed = written.map((one) => ({ aggregate: aggregateOf(one), version }));
          return { ok: true, value: { value: result.value, changed } };
        }),
      );
      const [first] = done.ok ? done.value.changed : [];
      if (first !== undefined) onChange(first.version);
      return done;
    },
    preview: (work) => alone(() => work(open(storage.sql).contexts)),
    read: (work) => alone(() => work(open(storage.sql).contexts)),
  };
}

function currentOf(kept: readonly Kept[], aggregate: string): number | string | null {
  const [kind = "", id = "", more] = aggregate.split("/");
  const current = kept.map((one) => one.current(kind, id)).find((one) => one !== undefined);
  // The key came from outside, so it is not repeated.
  if (current === undefined || more !== undefined) throw new Error("unknown-aggregate");
  return current;
}

/** The contexts over one database, each with a memory of its own that lasts for one scenario. */
function open(sql: SqlStorage) {
  const stores = {
    kinship: sqliteKinship(sql),
    places: sqlitePlaces(sql),
    evidence: sqliteEvidence(sql),
    life: sqliteLife(sql),
    trash: sqliteTrash(sql),
  };
  const kinship = kinshipOver(stores.kinship);
  const places = placesOver(stores.places);
  const evidence = evidenceOver(stores.evidence);
  const life = lifeOver(stores.life, kinship, places);
  const journal = journalOver(sqliteJournal(sql));
  const kept: Kept[] = Object.values(stores);
  const history: History = {
    trash: stores.trash,
    last: () => journal.last(),
    entry: (number) => journal.entry(number),
    entries: (page) => journal.entries(page),
    entriesOf: (subject) => journal.entriesOf(subject),
    authored(aggregate) {
      const [kind = "", id = ""] = aggregate.split("/");
      const value = kept.map((one) => one.authored(kind, id)).find((one) => one !== undefined);
      if (value === undefined) throw new Error("unknown-aggregate");
      return value;
    },
    state: () =>
      Object.fromEntries(
        kept
          .flatMap((one) => one.everything())
          .map(({ kind, id, value }) => [aggregateOf({ kind, id }), value]),
      ),
  };
  return { kept, journal, contexts: { kinship, places, evidence, life, history } };
}
