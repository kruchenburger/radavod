/** The tables of schema 3. */
export function addSnapshot(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE history_snapshot (
    part INTEGER PRIMARY KEY, version INTEGER NOT NULL, epoch TEXT NOT NULL, data BLOB NOT NULL
  )`);
}

const partSize = 1_500_000;

/** The packed snapshot of one version, for the browser. It may be thrown away at any time. */
export type KeptSnapshot = { version: number; epoch: string; data: Uint8Array };

export interface Snapshots {
  /** The one that is kept, null when there is none. */
  get(): KeptSnapshot | null;
  put(snapshot: KeptSnapshot): void;
  clear(): void;
}

export function sqliteSnapshots(sql: SqlStorage): Snapshots {
  return {
    get() {
      const parts = sql
        .exec<{ version: number; epoch: string; data: ArrayBuffer }>(
          "SELECT version, epoch, data FROM history_snapshot ORDER BY part",
        )
        .toArray();
      const [first] = parts;
      if (first === undefined) return null;
      const { version, epoch } = first;
      // Parts are written together; one of another version is the fault of the code.
      if (parts.some((one) => one.version !== version || one.epoch !== epoch)) return null;
      const data = new Uint8Array(parts.reduce((size, one) => size + one.data.byteLength, 0));
      let at = 0;
      for (const part of parts) {
        data.set(new Uint8Array(part.data), at);
        at += part.data.byteLength;
      }
      return { version, epoch, data };
    },
    put({ version, epoch, data }) {
      sql.exec("DELETE FROM history_snapshot");
      for (let part = 0; part * partSize < data.length; part++) {
        sql.exec(
          "INSERT INTO history_snapshot (part, version, epoch, data) VALUES (?, ?, ?, ?)",
          part,
          version,
          epoch,
          data.slice(part * partSize, (part + 1) * partSize),
        );
      }
    },
    clear() {
      sql.exec("DELETE FROM history_snapshot");
    },
  };
}
