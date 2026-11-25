import { type Evidence, evidenceOver, sqliteEvidence } from "../contexts/evidence";
import { type Act, aggregateOf, journalOver, sqliteJournal } from "../contexts/history";
import { type Kinship, kinshipOver, sqliteKinship } from "../contexts/kinship";
import { type Life, lifeOver, sqliteLife } from "../contexts/life";
import { type Places, placesOver, sqlitePlaces } from "../contexts/places";
import type { Result } from "../kernel/result";

export type Contexts = { kinship: Kinship; places: Places; evidence: Evidence; life: Life };

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
   * the same scenario did; each row is written once, at the end. A refused scenario writes nothing,
   * one that changes nothing writes no entry.
   */
  run<T extends object, E extends { code: string }>(
    command: Command,
    work: (contexts: Contexts) => Result<T, E>,
  ): Result<T & { changed: Changed[] }, E | StaleVersion>;
  /** Reads without a change. */
  read<T>(work: (contexts: Contexts) => T): T;
}

export function unitOfWork(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
): UnitOfWork {
  return {
    run: (command, work) =>
      storage.transactionSync(() => {
        const { kept, contexts } = open(storage.sql);
        for (const [aggregate, seen] of Object.entries(command.expected)) {
          const [kind = "", id = ""] = aggregate.split("/");
          const current = kept.map((one) => one.current(kind, id)).find((one) => one !== undefined);
          if (current === undefined) throw new Error(`unknown-aggregate ${kind}`);
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
        return { ok: true, value: { ...result.value, changed } };
      }),
    read: (work) => work(open(storage.sql).contexts),
  };
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
