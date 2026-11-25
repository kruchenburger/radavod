import { z } from "zod";
import { CorruptRow, jsonOf } from "../../../shared/rows";
import { memberIdSchema } from "../../../shared/values";
import type { JournalStore } from "../application/ports";
import type { Entry } from "../domain/entry";

export const historyTables = [
  "CREATE TABLE history_entry (number INTEGER PRIMARY KEY, data TEXT NOT NULL)",
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

const numbersSchema = z.array(z.int().positive());

export function sqliteJournal(sql: SqlStorage): JournalStore {
  return {
    last() {
      const [row] = sql
        .exec<{ last: number | null }>("SELECT max(number) AS last FROM history_entry")
        .toArray();
      return row?.last ?? 0;
    },
    append({ number, ...data }) {
      sql.exec(
        "INSERT INTO history_entry (number, data) VALUES (?, ?)",
        number,
        JSON.stringify(entrySchema.parse(data)),
      );
    },
    entry(number) {
      const [row] = sql
        .exec<{ data: string }>("SELECT data FROM history_entry WHERE number = ?", number)
        .toArray();
      if (row === undefined) return null;
      const parsed = entrySchema.safeParse(jsonOf(row.data));
      if (!parsed.success) throw new CorruptRow(`entry/${number}`);
      return { number, ...parsed.data };
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
