import { env, runInDurableObject } from "cloudflare:test";
import type { Parentage } from "../../src/contexts/kinship";
import type {
  BranchId,
  CitationId,
  EventId,
  Id,
  MemberId,
  PersonId,
  PlaceId,
  SourceId,
  UnionId,
} from "../../src/kernel/id";
import type { NameForm } from "../../src/kernel/name-form";
import {
  type Command,
  type Contexts,
  type UnitOfWork,
  unitOfWork,
} from "../../src/scenarios/unit-of-work";

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** An identifier as a real one looks, the same for the same name of at most eleven characters. */
export function idOf<K extends string>(kind: K, name: string): Id<K> {
  const digits = [...name].map((character) => {
    const code = character.charCodeAt(0);
    return `${alphabet[Math.floor(code / 58)]}${alphabet[code % 58]}`;
  });
  return `${kind}_${digits.join("").padEnd(22, "1")}` as Id<K>;
}

export const person = (name: string): PersonId => idOf("person", name);
export const union = (name: string): UnionId => idOf("union", name);
export const branch = (name: string): BranchId => idOf("branch", name);
export const place = (name: string): PlaceId => idOf("place", name);
export const source = (name: string): SourceId => idOf("source", name);
export const citation = (name: string): CitationId => idOf("citation", name);
export const event = (name: string): EventId => idOf("event", name);
export const anna: MemberId = idOf("member", "anna");

let opened = 0;

/** Runs a test inside a Durable Object of its own, over its real database. */
export function inTree<T>(work: (tree: Tree) => T | Promise<T>): Promise<T> {
  opened += 1;
  return inNamed(`test ${opened} ${crypto.randomUUID()}`, work);
}

export function inNamed<T>(name: string, work: (tree: Tree) => T | Promise<T>): Promise<T> {
  const stub = env.TREE.getByName(name);
  return runInDurableObject(stub, (_, state) => work(new Tree(state.storage)));
}

/** A database with the rows that were read and written over it. */
export class Tree {
  readonly storage: DurableObjectStorage;
  readonly work: UnitOfWork;
  #cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    const { sql } = storage;
    const counted = {
      exec: (query: string, ...bindings: unknown[]) => {
        const cursor = sql.exec(query, ...bindings);
        this.#cursors.push(cursor);
        return cursor;
      },
    } as unknown as SqlStorage;
    this.work = unitOfWork({
      sql: counted,
      transactionSync: (closure) => storage.transactionSync(closure),
    });
  }

  /** Runs a scenario. Without `expected` the editor believes nothing. */
  run<T extends object, E extends { code: string }>(
    work: Parameters<typeof this.work.run<T, E>>[1],
    command: Partial<Command> = {},
  ) {
    return this.work.run<T, E>(
      { actor: anna, now: 1_800_000_000_000, scenario: "test", expected: {}, ...command },
      work,
    );
  }

  /** Runs a scenario that must be accepted. */
  do(work: (contexts: Contexts) => unknown, command: Partial<Command> = {}) {
    const result = this.run((contexts) => {
      work(contexts);
      return { ok: true, value: {} };
    }, command);
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
    return result.value.changed;
  }

  read<T>(work: (contexts: Contexts) => T): T {
    return this.work.read(work);
  }

  /** The rows a piece of work read and wrote. */
  count(work: () => void): { read: number; written: number } {
    this.#cursors = [];
    work();
    const sum = (key: "rowsRead" | "rowsWritten") =>
      this.#cursors.reduce((all, cursor) => all + cursor[key], 0);
    return { read: sum("rowsRead"), written: sum("rowsWritten") };
  }

  /** Every row of every table, as it lies there. */
  rows(): Record<string, unknown[]> {
    const { sql } = this.storage;
    const tables = sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB '*[a-z]_[a-z]*' AND name NOT GLOB '_cf_*' ORDER BY name",
      )
      .toArray();
    return Object.fromEntries(
      tables.map(({ name }) => [name, sql.exec(`SELECT * FROM ${name}`).toArray()]),
    );
  }

  get entries(): number {
    return this.storage.sql.exec("SELECT number FROM history_entry").toArray().length;
  }
}

export const form = (id: string, more: Partial<NameForm> = {}): NameForm => ({
  id,
  language: "ru",
  script: "Cyrl",
  kind: "birth",
  given: "Верес",
  patronymic: "",
  surname: "",
  certainty: "hypothesis",
  ...more,
});

export const parentage = (parent: string, more: Partial<Parentage> = {}): Parentage => ({
  id: parent,
  parent: parent === "unknown" ? "unknown" : person(parent),
  union: null,
  kind: "blood",
  main: true,
  certainty: "hypothesis",
  ...more,
});

/** Says what a command must not be. */
export function accepted<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

export function addPerson({ kinship }: Pick<Contexts, "kinship">, name: string): void {
  accepted(
    kinship.apply({
      do: "add-person",
      person: {
        id: person(name),
        sex: "unknown",
        living: "unknown",
        names: [form("n1", { given: name })],
        mainName: "n1",
      },
      branch: null,
    }),
  );
}

export function addParent(
  { kinship }: Pick<Contexts, "kinship">,
  child: string,
  parent: string,
  more: Partial<Parentage> = {},
): void {
  accepted(
    kinship.apply({ do: "add-parent", child: person(child), parentage: parentage(parent, more) }),
  );
}

export function addUnion(
  { kinship }: Pick<Contexts, "kinship">,
  name: string,
  first: string,
  second: string,
): void {
  accepted(
    kinship.apply({
      do: "add-union",
      union: {
        id: union(name),
        partners: [person(first), person(second)],
        kind: "marriage",
        branch: null,
        certainty: "hypothesis",
      },
    }),
  );
}

export function addBranch({ kinship }: Pick<Contexts, "kinship">, name: string): void {
  accepted(
    kinship.apply({
      do: "add-branch",
      branch: { id: branch(name), title: { ru: name, en: name }, color: 0 },
    }),
  );
}
