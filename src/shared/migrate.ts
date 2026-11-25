/** The statements of a database, as much as a migration needs of them. */
type Statements = { exec(query: string, ...bindings: unknown[]): { toArray(): unknown[] } };

/** One change of the tables. A step that is out is never edited: the next one mends it. */
export type Migration<Sql extends Statements = Statements> = {
  number: number;
  up: (sql: Sql) => void;
};

/** The statements of the table where a context records the steps its database took. */
export type StepTable = {
  create: string;
  /** Answers `last`, the number of the last step or null. */
  last: string;
  /** Takes the number of a step. */
  record: string;
};

/**
 * Brings a database to the last step, in one transaction, and records the steps it took. A database
 * newer than the code is refused: it would be read by rules that do not know it.
 */
export function migrateBy<Sql extends Statements>(
  storage: { sql: Sql; transactionSync<T>(work: () => T): T },
  steps: readonly Migration<Sql>[],
  table: StepTable,
): void {
  const { sql } = storage;
  if (steps.some(({ number }, i) => number !== i + 1)) throw new Error("migrations-out-of-order");
  storage.transactionSync(() => {
    sql.exec(table.create);
    const [row] = sql.exec(table.last).toArray() as { last: number | null }[];
    const last = row?.last ?? 0;
    if (last > steps.length) throw new Error("schema-is-newer");
    for (const { number, up } of steps.slice(last)) {
      up(sql);
      sql.exec(table.record, number);
    }
  });
}
