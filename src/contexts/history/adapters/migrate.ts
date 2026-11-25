import { type Migration as Step, migrateBy } from "../../../shared/migrate";

export type Migration = Step<SqlStorage>;

/** Brings the database of the tree to the last step. */
export function migrate(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
  steps: readonly Migration[],
): void {
  migrateBy(storage, steps, {
    create: "CREATE TABLE IF NOT EXISTS history_schema (number INTEGER PRIMARY KEY)",
    last: "SELECT max(number) AS last FROM history_schema",
    record: "INSERT INTO history_schema (number) VALUES (?)",
  });
}
