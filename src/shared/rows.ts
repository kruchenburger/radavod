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

/** Something that could not be read back, and so is not written. It is the fault of the code. */
export class BadWrite extends Error {
  readonly code = "bad-write";
  readonly key: string;

  constructor(key: string) {
    super(`bad-write ${key}`);
    this.name = "BadWrite";
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
  /** What somebody wrote in an aggregate, null when it is not there, undefined of another context. */
  authored(kind: string, id: string): unknown;
  /** Everything somebody wrote. It reads every row. */
  everything(): { kind: string; id: string; value: unknown }[];
}

type Aggregate<Id> = { id: Id; version: number };

/**
 * The aggregates of one table in one unit of work: each is read once and written once. They cannot be
 * changed in place: a change is put.
 */
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
    this.#row(id).now = frozen(value);
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

  authored(id: Id): unknown {
    return this.#authored(this.get(id));
  }

  /** What was written in the aggregates found in the table, which are all. */
  authoredAmong(found: readonly (RawRow & { id: Id })[]) {
    return this.among(found).flatMap((value) => {
      const authored = this.#authored(value);
      return authored === null ? [] : [{ kind: this.#kind, id: value.id, value: authored }];
    });
  }

  flush(version: number): Written[] {
    const written: Written[] = [];
    for (const [id, { stored, now }] of this.#known) {
      if (stored === now || !differ(dataOf(stored), dataOf(now))) continue;
      const changed = writes(this.#kind, id, this.#authored(stored), this.#authored(now));
      written.push(...changed);
      const counted = changed.length > 0 ? version : (stored?.version ?? 0);
      // A row nobody ever wrote anything in does not stay, another keeps the version somebody saw.
      if (now === null || (isEmpty(dataOf(now)) && counted === 0)) {
        if (stored !== null) this.#table.remove(id);
        continue;
      }
      const data = JSON.stringify(dataOf(now));
      if (this.#parse(data) === undefined) throw new BadWrite(`${this.#kind}/${id}`);
      this.#table.write(id, counted, data);
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
    const parsed = this.#parse(data);
    if (!counted.success || parsed === undefined) throw new CorruptRow(`${this.#kind}/${id}`);
    return frozen({ ...parsed, id, version: counted.data } as Value);
  }

  #parse(data: unknown): Omit<Value, "id" | "version"> | undefined {
    return this.#schema.safeParse(jsonOf(data)).data;
  }

  #authored(value: Value | null): unknown {
    const data = dataOf(value);
    if (data === null) return null;
    const fields = Object.entries(data).filter(
      ([key]) => !this.#mirrors.includes(key as keyof Value),
    );
    const authored = Object.fromEntries(fields);
    // A row may hold mirrors only. Nobody wrote that.
    return isEmpty(authored) ? null : authored;
  }
}

function dataOf<Value extends Aggregate<unknown>>(value: Value | null): object | null {
  if (value === null) return null;
  const { id: _id, version: _version, ...data } = value;
  return data;
}

/** Whether there are only lists, with nothing in them. */
function isEmpty(data: object | null): boolean {
  return (
    data === null ||
    Object.values(data).every((field) => Array.isArray(field) && field.length === 0)
  );
}

function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const part of Object.values(value)) frozen(part);
  }
  return value;
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
