import { z } from "zod";
import { isId, type PersonId, type PlaceId } from "../../../kernel/id";
import { type Kept, type RawRow, Rows, type Written } from "../../../shared/rows";
import {
  certaintySchema,
  eventIdSchema,
  fuzzyDateSchema,
  personIdSchema,
  placeIdSchema,
  unionIdSchema,
} from "../../../shared/values";
import type { LifeStore } from "../application/ports";
import type { LifeEvent } from "../domain/event";
import type { Change, PersonLife } from "../domain/life";

export const lifeTables = [
  `CREATE TABLE life_subject (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
];

const eventSchema = z.strictObject({
  id: eventIdSchema,
  kind: z.enum([
    "birth",
    "baptism",
    "wedding",
    "divorce",
    "residence",
    "service",
    "occupation",
    "emigration",
    "repression",
    "death",
    "burial",
    "other",
  ]),
  title: z.string(),
  date: fuzzyDateSchema.nullable(),
  place: placeIdSchema.nullable(),
  participants: z.array(z.strictObject({ person: personIdSchema, role: z.string() })).min(1),
  union: unionIdSchema.nullable(),
  main: z.boolean(),
  certainty: certaintySchema,
  note: z.string(),
}) satisfies z.ZodType<LifeEvent>;

const lifeSchema = z.strictObject({
  events: z.array(eventSchema),
  takesPart: z.array(z.strictObject({ event: eventIdSchema, home: personIdSchema })),
}) satisfies z.ZodType<Omit<PersonLife, "id" | "version">>;

export function sqliteLife(sql: SqlStorage): LifeStore & Kept {
  return new SqliteLife(sql);
}

class SqliteLife implements LifeStore, Kept {
  readonly #sql: SqlStorage;
  readonly #lives: Rows<PersonId, PersonLife>;

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    this.#lives = new Rows<PersonId, PersonLife>(
      "life",
      lifeSchema,
      {
        read: (id) =>
          sql.exec<RawRow>("SELECT version, data FROM life_subject WHERE id = ?", id).toArray()[0],
        write: (id, version, data) => {
          sql.exec(
            `INSERT INTO life_subject (id, version, data) VALUES (?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
            id,
            version,
            data,
          );
        },
        remove: (id) => {
          sql.exec("DELETE FROM life_subject WHERE id = ?", id);
        },
      },
      ["takesPart"],
    );
  }

  lifeOf(id: PersonId): PersonLife | null {
    return this.#lives.get(id);
  }

  countAt(place: PlaceId): number {
    const found = this.#sql
      .exec<RawRow & { id: PersonId }>(
        "SELECT id, version, data FROM life_subject WHERE instr(data, ?) > 0",
        place,
      )
      .toArray();
    const events = this.#lives.among(found).flatMap((life) => life.events);
    return events.filter((event) => event.place === place).length;
  }

  save(change: Change): void {
    for (const { id, after } of change) this.#lives.put(id, after);
  }

  current(kind: string, id: string): number | undefined {
    return kind === "life" && isId("person", id) ? this.#lives.version(id) : undefined;
  }

  flush(version: number): Written[] {
    return this.#lives.flush(version);
  }
}
