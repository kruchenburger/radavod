import { type Evidence, evidenceOver, sqliteEvidence } from "../contexts/evidence";
import { type Act, aggregateOf, journalOver, sqliteJournal } from "../contexts/history";
import { type Kinship, kinshipOver, sqliteKinship } from "../contexts/kinship";
import { type Life, lifeOver, sqliteLife } from "../contexts/life";
import { type Places, placesOver, sqlitePlaces } from "../contexts/places";
import type { Result } from "../kernel/result";
import type { Kept } from "../shared/rows";

export type Contexts = { kinship: Kinship; places: Places; evidence: Evidence; life: Life };

/** What can be asked without a change. */
export type Reading = {
  kinship: Pick<Kinship, "get" | "union" | "branch" | "relatives">;
  places: Pick<Places, "get" | "nameOn" | "affiliationOn">;
  evidence: Pick<Evidence, "source" | "citationsOf" | "countFor">;
  life: Pick<Life, "event" | "eventsOf" | "main" | "countAt" | "warnings">;
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

export interface UnitOfWork {
  /**
   * Runs one scenario in one transaction with one journal entry. Commands see what earlier ones of
   * the same scenario did, and everything is written at the end. A refused scenario writes nothing,
   * one that changes nothing writes no entry. A scenario does not run inside another.
   */
  run<T, E extends { code: string }>(
    command: Command,
    work: (contexts: Contexts) => Result<T, E>,
  ): Result<{ value: T; changed: Changed[] }, E | StaleVersion>;
  read<T>(work: (contexts: Reading) => T): T;
}

export function unitOfWork(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
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
    run: (command, work) =>
      alone(() =>
        storage.transactionSync(() => {
          const { kept, contexts } = open(storage.sql);
          for (const [aggregate, seen] of Object.entries(command.expected)) {
            const current = currentOf(kept, aggregate);
            if (current !== seen) {
              return { ok: false, error: { code: "stale-version", aggregate, current } };
            }
          }
          const result = work(contexts);
          if (!result.ok) return result;

          const journal = journalOver(sqliteJournal(storage.sql));
          const version = journal.next();
          const written = kept.flatMap((one) => one.flush(version));
          if (written.length > 0) journal.write(version, command, written);
          const changed = written.map((one) => ({ aggregate: aggregateOf(one), version }));
          return { ok: true, value: { value: result.value, changed } };
        }),
      ),
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
  };
  const kinship = kinshipOver(stores.kinship);
  const places = placesOver(stores.places);
  const evidence = evidenceOver(stores.evidence);
  const life = lifeOver(stores.life, kinship, places);
  return { kept: Object.values(stores), contexts: { kinship, places, evidence, life } };
}
