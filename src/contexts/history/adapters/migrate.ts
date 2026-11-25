/** One change of the tables. A step that is out is never edited: the next one mends it. */
export type Migration = { number: number; up: (sql: SqlStorage) => void };

/**
 * Brings a database to the last step, in one transaction, and records the steps it took. A database
 * newer than the code is refused: it would be read by rules that do not know it.
 */
export function migrate(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
  steps: readonly Migration[],
): void {
  const { sql } = storage;
  if (steps.some(({ number }, i) => number !== i + 1)) throw new Error("migrations-out-of-order");
  storage.transactionSync(() => {
    sql.exec("CREATE TABLE IF NOT EXISTS history_schema (number INTEGER PRIMARY KEY)");
    const [row] = sql
      .exec<{ last: number | null }>("SELECT max(number) AS last FROM history_schema")
      .toArray();
    const last = row?.last ?? 0;
    if (last > steps.length) throw new Error("schema-is-newer");
    for (const { number, up } of steps.slice(last)) {
      up(sql);
      sql.exec("INSERT INTO history_schema (number) VALUES (?)", number);
    }
  });
}
