/** The tables of schema 2. */
export function upgradeHistory(sql: SqlStorage): void {
  // Nobody was ever in the trash of schema 1.
  sql.exec("DROP TABLE history_trash");
  sql.exec(`CREATE TABLE history_trash (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`);
  sql.exec("CREATE TABLE history_name (number INTEGER PRIMARY KEY, title TEXT NOT NULL)");
  sql.exec("CREATE TABLE history_bulk (number INTEGER PRIMARY KEY)");
  sql.exec(`CREATE TABLE history_checkpoint (
    number INTEGER NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL,
    PRIMARY KEY (number, part)
  ) WITHOUT ROWID`);
  sql.exec(`CREATE TABLE history_epoch (
    id INTEGER PRIMARY KEY CHECK (id = 1), epoch TEXT NOT NULL, erasures INTEGER NOT NULL
  )`);
  sql.exec("INSERT INTO history_epoch (id, epoch, erasures) VALUES (1, ?, 0)", crypto.randomUUID());
}

const partSize = 1_500_000;
/** Checkpoints are for speed: of the newest versions more is asked than of the rest. */
const kept = 20;

/** States of the tree, packed. They may be thrown away at any time. */
export interface Checkpoints {
  put(number: number, data: Uint8Array): void;
  /** The nearest one after an entry, or at it. */
  from(number: number): { number: number; data: Uint8Array } | null;
  /** The number of the last one, 0 when there is none. */
  last(): number;
  clear(): void;
  epoch(): string;
  renewEpoch(epoch: string): void;
  /** How often somebody was erased. */
  erasures(): number;
}

export function sqliteCheckpoints(sql: SqlStorage): Checkpoints {
  return {
    put(number, data) {
      sql.exec("DELETE FROM history_checkpoint WHERE number = ?", number);
      for (let part = 0; part * partSize < data.length; part++) {
        sql.exec(
          "INSERT INTO history_checkpoint (number, part, data) VALUES (?, ?, ?)",
          number,
          part,
          data.slice(part * partSize, (part + 1) * partSize),
        );
      }
      sql.exec(
        `DELETE FROM history_checkpoint WHERE number NOT IN (
          SELECT DISTINCT number FROM history_checkpoint ORDER BY number DESC LIMIT ?
        )`,
        kept,
      );
    },
    from(number) {
      const [row] = sql
        .exec<{ first: number | null }>(
          "SELECT min(number) AS first FROM history_checkpoint WHERE number >= ?",
          number,
        )
        .toArray();
      const first = row?.first ?? null;
      if (first === null) return null;
      const parts = sql
        .exec<{ data: ArrayBuffer }>(
          "SELECT data FROM history_checkpoint WHERE number = ? ORDER BY part",
          first,
        )
        .toArray()
        .map(({ data }) => new Uint8Array(data));
      const whole = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
      let at = 0;
      for (const part of parts) {
        whole.set(part, at);
        at += part.length;
      }
      return { number: first, data: whole };
    },
    last() {
      const [row] = sql
        .exec<{ last: number | null }>("SELECT max(number) AS last FROM history_checkpoint")
        .toArray();
      return row?.last ?? 0;
    },
    clear() {
      sql.exec("DELETE FROM history_checkpoint");
      sql.exec("UPDATE history_epoch SET erasures = erasures + 1");
    },
    epoch: () => sql.exec<{ epoch: string }>("SELECT epoch FROM history_epoch").one().epoch,
    renewEpoch(epoch) {
      sql.exec("UPDATE history_epoch SET epoch = ?", epoch);
    },
    erasures: () =>
      sql.exec<{ erasures: number }>("SELECT erasures FROM history_epoch").one().erasures,
  };
}
