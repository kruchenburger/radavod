import { z } from "zod";
import { isId, type PlaceId } from "../../../kernel/id";
import { type Kept, type RawRow, Rows, type Written } from "../../../shared/rows";
import { fuzzyDateSchema, languageSchema } from "../../../shared/values";
import type { PlacesStore } from "../application/ports";
import type { Change, Period, Place } from "../domain/place";

export const placesTables = [
  `CREATE TABLE places_place (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
];

const periodSchema = z.strictObject({
  from: fuzzyDateSchema.nullable(),
  to: fuzzyDateSchema.nullable(),
}) satisfies z.ZodType<Period>;

const placeSchema = z.strictObject({
  names: z.array(
    z.strictObject({
      text: z.string(),
      language: languageSchema,
      period: periodSchema.nullable(),
    }),
  ),
  affiliations: z.array(z.strictObject({ name: z.string(), period: periodSchema.nullable() })),
  coordinates: z
    .strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .nullable(),
}) satisfies z.ZodType<Omit<Place, "id" | "version">>;

export function sqlitePlaces(sql: SqlStorage): PlacesStore & Kept {
  return new SqlitePlaces(sql);
}

class SqlitePlaces implements PlacesStore, Kept {
  readonly #sql: SqlStorage;
  readonly #places: Rows<PlaceId, Place>;

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    this.#places = new Rows<PlaceId, Place>("place", placeSchema, {
      read: (id) =>
        sql.exec<RawRow>("SELECT version, data FROM places_place WHERE id = ?", id).toArray()[0],
      write: (id, version, data) => {
        sql.exec(
          `INSERT INTO places_place (id, version, data) VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
          id,
          version,
          data,
        );
      },
      remove: (id) => {
        sql.exec("DELETE FROM places_place WHERE id = ?", id);
      },
    });
  }

  place(id: PlaceId): Place | null {
    return this.#places.get(id);
  }

  save(change: Change): void {
    for (const { id, after } of change) this.#places.put(id, after);
  }

  current(kind: string, id: string): number | undefined {
    return kind === "place" && isId("place", id) ? this.#places.version(id) : undefined;
  }

  authored(kind: string, id: string): unknown {
    return kind === "place" && isId("place", id) ? this.#places.authored(id) : undefined;
  }

  everything() {
    const rows = this.#sql.exec<RawRow & { id: PlaceId }>(
      "SELECT id, version, data FROM places_place",
    );
    return this.#places.authoredAmong(rows.toArray());
  }

  flush(version: number): Written[] {
    return this.#places.flush(version);
  }
}
