import { z } from "zod";
import { differ, writes } from "../kernel/change";

/** Rows of aggregates as the adapters of the contexts keep them. It knows no table and no SQL. */

/** A row that is not what its schema says. Neither the message nor the cause has its content. */
export class CorruptRow extends Error {
  readonly code = "corrupt-row";
  readonly key: string;

  constructor(key: string) {
    super(`corrupt-row ${key}`);
    this.name = "CorruptRow";
    this.key = key;
  }
}

/** A row as the database gives it. Its schema says what it is. */
export type RawRow = { version: RawValue; data: RawValue };
type RawValue = ArrayBuffer | string | number | null;

/** The statements of one table. */
export type Table<Id> = {
  read: (id: Id) => RawRow | undefined;
  write: (id: Id, version: number, data: string) => void;
  remove: (id: Id) => void;
};

/** What somebody changed in an aggregate, without its identifier and version. */
export type Written = { kind: string; id: string; before: unknown; after: unknown };

/** The part of a context in a unit of work. */
export interface Kept {
  /** What an editor must have seen: the version of an aggregate, 0 when it is not there. */
  current(kind: string, id: string): number | string | null | undefined;
  /** Writes everything that was saved, each row once, and tells what was changed. */
  flush(version: number): Written[];
}

type Aggregate<Id> = { id: Id; version: number };

/** The aggregates of one table in one unit of work: each is read once and written once. */
export class Rows<Id extends string, Value extends Aggregate<Id>> {
  readonly #kind: string;
  readonly #schema: z.ZodType<Omit<Value, "id" | "version">>;
  readonly #table: Table<Id>;
  readonly #mirrors: readonly (keyof Value)[];
  readonly #known = new Map<Id, { stored: Value | null; now: Value | null }>();

  /** `mirrors` are the fields that follow from other aggregates: they make no version. */
  constructor(
    kind: string,
    schema: z.ZodType<Omit<Value, "id" | "version">>,
    table: Table<Id>,
    mirrors: readonly (keyof Value)[] = [],
  ) {
    this.#kind = kind;
    this.#schema = schema;
    this.#table = table;
    this.#mirrors = mirrors;
  }

  get(id: Id): Value | null {
    return this.#row(id).now;
  }

  put(id: Id, value: Value | null): void {
    this.#row(id).now = value;
  }

  version(id: Id): number {
    return this.#row(id).stored?.version ?? 0;
  }

  /** Every aggregate among those found in the table and those changed and not written yet. */
  among(found: readonly (RawRow & { id: Id })[]): Value[] {
    for (const row of found) {
      if (!this.#known.has(row.id)) this.#load(row.id, row);
    }
    return [...this.#known.values()].flatMap(({ now }) => now ?? []);
  }

  flush(version: number): Written[] {
    const written: Written[] = [];
    for (const [id, { stored, now }] of this.#known) {
      if (stored === now || !differ(dataOf(stored), dataOf(now))) continue;
      const changed = writes(this.#kind, id, this.#authored(stored), this.#authored(now));
      written.push(...changed);
      if (now === null) {
        this.#table.remove(id);
        continue;
      }
      const data = JSON.stringify(dataOf(now));
      // What could not be read back is not written.
      this.#parse(id, data);
      this.#table.write(id, changed.length > 0 ? version : (stored?.version ?? 0), data);
    }
    return written;
  }

  #row(id: Id) {
    return this.#known.get(id) ?? this.#load(id, this.#table.read(id));
  }

  #load(id: Id, raw: RawRow | undefined) {
    const stored = raw === undefined ? null : this.#value(id, raw);
    const row = { stored, now: stored };
    this.#known.set(id, row);
    return row;
  }

  #value(id: Id, { version, data }: RawRow): Value {
    const counted = z.int().nonnegative().safeParse(version);
    if (!counted.success) throw new CorruptRow(`${this.#kind}/${id}`);
    return { ...this.#parse(id, data), id, version: counted.data } as Value;
  }

  #parse(id: Id, data: unknown): Omit<Value, "id" | "version"> {
    const parsed = this.#schema.safeParse(jsonOf(data));
    if (!parsed.success) throw new CorruptRow(`${this.#kind}/${id}`);
    return parsed.data;
  }

  #authored(value: Value | null): unknown {
    const data = dataOf(value);
    if (data === null) return null;
    const fields = Object.entries(data).filter(
      ([key]) => !this.#mirrors.includes(key as keyof Value),
    );
    // Lists with nothing in them were not written by anybody: a row may hold mirrors only.
    const isEmpty = fields.every(([, field]) => Array.isArray(field) && field.length === 0);
    return isEmpty ? null : Object.fromEntries(fields);
  }
}

function dataOf<Value extends Aggregate<unknown>>(value: Value | null): object | null {
  if (value === null) return null;
  const { id: _id, version: _version, ...data } = value;
  return data;
}

/** The value of a text of JSON, or undefined. The error would quote the text. */
export function jsonOf(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
