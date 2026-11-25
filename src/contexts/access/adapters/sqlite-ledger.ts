import { isId, type PersonId } from "../../../kernel/id";
import { BadWrite, CorruptRow } from "../../../shared/rows";
import type { ErasureLedger } from "../application/ledger";

/** Identifiers of the erased, and nothing else about them. */
export function sqliteLedger(sql: SqlStorage): ErasureLedger {
  sql.exec("CREATE TABLE IF NOT EXISTS access_erased (id TEXT PRIMARY KEY) WITHOUT ROWID");
  return {
    remember(ids) {
      if (!ids.every((id) => isId("person", id))) throw new BadWrite("erased");
      for (const id of ids) {
        sql.exec("INSERT INTO access_erased (id) VALUES (?) ON CONFLICT (id) DO NOTHING", id);
      }
    },
    all() {
      return sql
        .exec<{ id: string }>("SELECT id FROM access_erased ORDER BY id")
        .toArray()
        .map(({ id }): PersonId => {
          if (!isId("person", id)) throw new CorruptRow("erased");
          return id;
        });
    },
  };
}
