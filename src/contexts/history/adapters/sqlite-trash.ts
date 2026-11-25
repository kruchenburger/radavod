import { z } from "zod";
import { isId, type PersonId } from "../../../kernel/id";
import { type Kept, type RawRow, Rows } from "../../../shared/rows";
import {
  branchIdSchema,
  memberIdSchema,
  personIdSchema,
  unionIdSchema,
} from "../../../shared/values";
import type { Trash, Trashed } from "../domain/trash";

const trashedSchema = z.strictObject({
  at: z.int(),
  by: memberIdSchema,
  person: z.json(),
  branch: branchIdSchema.nullable(),
  children: z.array(z.strictObject({ child: personIdSchema, parentage: z.json() })),
  unions: z.array(
    z.strictObject({
      id: unionIdSchema,
      union: z.json(),
      branch: branchIdSchema.nullable(),
      citations: z.array(z.json()),
      children: z.array(z.strictObject({ child: personIdSchema, parentage: z.string() })),
    }),
  ),
  events: z.array(z.json()),
  guest: z.array(
    z.strictObject({ home: personIdSchema, event: z.string(), roles: z.array(z.string()) }),
  ),
  citations: z.array(z.json()),
}) satisfies z.ZodType<Omit<Trashed, "id" | "version">>;

export function sqliteTrash(sql: SqlStorage): Trash & Kept {
  const rows = new Rows<PersonId, Trashed>("trash", trashedSchema, {
    read: (id) =>
      sql.exec<RawRow>("SELECT version, data FROM history_trash WHERE id = ?", id).toArray()[0],
    write: (id, version, data) => {
      sql.exec(
        `INSERT INTO history_trash (id, version, data) VALUES (?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
        id,
        version,
        data,
      );
    },
    remove: (id) => {
      sql.exec("DELETE FROM history_trash WHERE id = ?", id);
    },
  });
  const found = () =>
    sql
      .exec<RawRow & { id: PersonId }>("SELECT id, version, data FROM history_trash ORDER BY id")
      .toArray();
  return {
    get: (id) => rows.get(id),
    put: (id, trashed) => rows.put(id, trashed),
    everybody: () => rows.among(found()),
    current: (kind, id) => (kind === "trash" && isId("person", id) ? rows.version(id) : undefined),
    authored: (kind, id) =>
      kind === "trash" && isId("person", id) ? rows.authored(id) : undefined,
    everything: () => rows.authoredAmong(found()),
    flush: (version) => rows.flush(version),
  };
}
