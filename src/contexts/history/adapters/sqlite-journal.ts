import { z } from "zod";
import { BadWrite, CorruptRow, jsonOf } from "../../../shared/rows";
import { memberIdSchema } from "../../../shared/values";
import type { JournalStore } from "../application/ports";
import type { Entry, Patch } from "../domain/entry";

export const historyTables = [
  // An entry lies in parts: an import is larger than a row may be.
  `CREATE TABLE history_entry (
    number INTEGER NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (number, part)
  ) WITHOUT ROWID`,
  "CREATE TABLE history_subject (id TEXT PRIMARY KEY, entries TEXT NOT NULL) WITHOUT ROWID",
  "CREATE TABLE history_trash (id TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID",
];

const entrySchema = z.strictObject({
  at: z.int(),
  by: memberIdSchema,
  scenario: z.string().min(1),
  patches: z.array(
    z.strictObject({
      aggregate: z.string().min(1),
      path: z.string(),
      before: z.json(),
      after: z.json(),
    }),
  ),
}) satisfies z.ZodType<Omit<Entry, "number">>;

/** How much text a part takes: in bytes three times as much at most, well below what a row holds. */
const partSize = 500_000;

const numbersSchema = z.array(z.int().positive());

export function sqliteJournal(sql: SqlStorage): JournalStore {
  return {
    last() {
      const [row] = sql
        .exec<{ last: number | null }>("SELECT max(number) AS last FROM history_entry")
        .toArray();
      return row?.last ?? 0;
    },
    append({ number, patches, ...act }) {
      for (const [part, some] of partsOf(patches).entries()) {
        const data = JSON.stringify({ ...act, patches: some });
        if (!entrySchema.safeParse(jsonOf(data)).success) throw new BadWrite(`entry/${number}`);
        sql.exec(
          "INSERT INTO history_entry (number, part, data) VALUES (?, ?, ?)",
          number,
          part,
          data,
        );
      }
    },
    entry(number) {
      const parts = sql
        .exec<{ data: string }>(
          "SELECT data FROM history_entry WHERE number = ? ORDER BY part",
          number,
        )
        .toArray()
        .map(({ data }) => {
          const parsed = entrySchema.safeParse(jsonOf(data));
          if (!parsed.success) throw new CorruptRow(`entry/${number}`);
          return parsed.data;
        });
      const [first] = parts;
      return first === undefined
        ? null
        : { ...first, number, patches: parts.flatMap(({ patches }) => patches) };
    },
    numbersOf(subject) {
      const [row] = sql
        .exec<{ entries: string }>("SELECT entries FROM history_subject WHERE id = ?", subject)
        .toArray();
      if (row === undefined) return [];
      const parsed = numbersSchema.safeParse(jsonOf(row.entries));
      if (!parsed.success) throw new CorruptRow(`subject/${subject}`);
      return parsed.data;
    },
    putNumbers(subject, numbers) {
      sql.exec(
        `INSERT INTO history_subject (id, entries) VALUES (?, ?)
          ON CONFLICT (id) DO UPDATE SET entries = excluded.entries`,
        subject,
        JSON.stringify(numbers),
      );
    },
  };
}

/** Patches by the parts they are kept in. An entry without patches has one part. */
function partsOf(patches: readonly Patch[]): Patch[][] {
  const parts: Patch[][] = [[]];
  let size = 0;
  for (const patch of patches) {
    const length = JSON.stringify(patch).length;
    if (size > 0 && size + length > partSize) {
      parts.push([]);
      size = 0;
    }
    parts.at(-1)?.push(patch);
    size += length;
  }
  return parts;
}
