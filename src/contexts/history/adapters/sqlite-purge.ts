import type { PersonId } from "../../../kernel/id";
import type { NameForm } from "../../../kernel/name-form";
import { takeBack } from "../../../shared/reverse";
import { BadWrite, CorruptRow, jsonOf } from "../../../shared/rows";
import { namesOverTime, scrubbed, wholeNames, withoutPerson, wordsOf } from "../domain/erase";
import { sqliteCheckpoints } from "./sqlite-checkpoints";
import { entrySchema } from "./sqlite-journal";

/**
 * Takes a person out of the whole history: journal, names of versions, checkpoints. It looks at every
 * entry, for a name may stand in any of them. Run in the transaction that takes them out of the tree,
 * after its entry is written.
 */
export function purge(
  sql: SqlStorage,
  id: PersonId,
  forms: readonly Parts[],
  /** Names of everybody else: a whole name of somebody else is not taken. */
  others: readonly Parts[],
): void {
  const own = partsWith(sql, [id]);
  // Who was erased before is in no entry, and nothing is written again.
  if (own.length === 0 && forms.length === 0) return;
  const entries = Map.groupBy(own, ({ number }) => number);
  const known = namesOverTime(
    [...entries.values()].map((parts) => parts.flatMap(({ entry }) => entry.patches)),
    id,
    (value, { aggregate, path, after }) => takeBack(value, { aggregate, path, before: after }),
  );
  const names = wholeNames([...forms, ...known], others);
  const words = wordsOf(names);
  for (const { number, part, entry } of partsWith(sql, [id, ...names])) {
    const left = withoutPerson(entry.patches, id, words);
    const data = JSON.stringify({ ...entry, patches: left });
    if (!entrySchema.safeParse(jsonOf(data)).success) throw new BadWrite(`entry/${number}`);
    sql.exec("UPDATE history_entry SET data = ? WHERE number = ? AND part = ?", data, number, part);
  }
  sql.exec("DELETE FROM history_subject WHERE id = ?", id);
  const titles = sql.exec<{ number: number; title: string }>(
    "SELECT number, title FROM history_name",
  );
  for (const { number, title } of titles.toArray()) {
    const clean = scrubbed(title, id, words);
    if (clean === title) continue;
    sql.exec("UPDATE history_name SET title = ? WHERE number = ?", String(clean), number);
  }
  // They are packed, so nobody can look into them. New ones are made when it is time.
  sqliteCheckpoints(sql).clear();
}

type Parts = Pick<NameForm, "given" | "patronymic" | "surname">;
const lookedAtOnce = 50;

/** The parts of entries with one of some texts in them. */
function partsWith(sql: SqlStorage, texts: readonly string[]) {
  const found = new Map<string, { number: number; part: number; data: string }>();
  // As they stand in JSON, and some at a time: each look is a look at every entry.
  const needles = texts.map((text) => JSON.stringify(text).slice(1, -1));
  for (let at = 0; at < needles.length; at += lookedAtOnce) {
    const some = needles.slice(at, at + lookedAtOnce);
    const rows = sql.exec<{ number: number; part: number; data: string }>(
      `SELECT number, part, data FROM history_entry WHERE ${some.map(() => "instr(data, ?) > 0").join(" OR ")}`,
      ...some,
    );
    for (const row of rows) found.set(`${row.number}/${row.part}`, row);
  }
  const inOrder = [...found.values()].sort((a, b) => a.number - b.number || a.part - b.part);
  return inOrder.map(({ number, part, data }) => {
    const parsed = entrySchema.safeParse(jsonOf(data));
    if (!parsed.success) throw new CorruptRow(`entry/${number}`);
    return { number, part, entry: parsed.data };
  });
}
