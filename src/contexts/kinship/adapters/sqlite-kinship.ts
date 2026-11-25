import { z } from "zod";
import type { BranchId, PersonId, UnionId } from "../../../kernel/id";
import {
  BadWrite,
  CorruptRow,
  jsonOf,
  type Kept,
  type RawRow,
  Rows,
  type Written,
} from "../../../shared/rows";
import {
  branchIdSchema,
  certaintySchema,
  nameFormSchema,
  partIdSchema,
  personIdSchema,
  unionIdSchema,
} from "../../../shared/values";
import type { KinshipStore } from "../application/ports";
import type { Branch } from "../domain/branch";
import type { Change, Members, PersonRecord, UnionRecord } from "../domain/family-graph";
import type { Parentage, Person } from "../domain/person";
import type { Union } from "../domain/union";

export const kinshipTables = [
  `CREATE TABLE kinship_person (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE kinship_union (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE kinship_branch (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, members TEXT NOT NULL
  ) WITHOUT ROWID`,
];

const parentageSchema = z.strictObject({
  id: partIdSchema,
  parent: z.union([personIdSchema, z.literal("unknown")]),
  union: unionIdSchema.nullable(),
  kind: z.enum(["blood", "adoption", "guardianship", "unknown"]),
  main: z.boolean(),
  certainty: certaintySchema,
}) satisfies z.ZodType<Parentage>;

const personSchema = z.strictObject({
  sex: z.enum(["male", "female", "other", "unknown"]),
  living: z.enum(["yes", "no", "unknown"]),
  names: z.array(nameFormSchema),
  mainName: partIdSchema.nullable(),
  parents: z.array(parentageSchema),
  children: z.array(personIdSchema),
  unions: z.array(unionIdSchema),
  childOrder: z.array(personIdSchema),
}) satisfies z.ZodType<Omit<PersonRecord, "id" | "version">>;

const unionSchema = z.strictObject({
  partners: z.tuple([personIdSchema, z.union([personIdSchema, z.literal("unknown")])]),
  kind: z.enum(["marriage", "civil", "unknown"]),
  certainty: certaintySchema,
}) satisfies z.ZodType<Omit<UnionRecord, "id" | "version">>;

const branchSchema = z.strictObject({
  title: z.strictObject({ ru: z.string(), en: z.string() }),
  color: z.literal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
}) satisfies z.ZodType<Omit<Branch, "id" | "version">>;

const membersSchema = z.strictObject({
  people: z.array(personIdSchema),
  unions: z.array(unionIdSchema),
}) satisfies z.ZodType<Members>;

export function sqliteKinship(sql: SqlStorage): KinshipStore & Kept {
  return new SqliteKinship(sql);
}

class SqliteKinship implements KinshipStore, Kept {
  readonly #people: Rows<PersonId, PersonRecord>;
  readonly #unions: Rows<UnionId, UnionRecord>;
  readonly #branches: Rows<BranchId, Branch>;
  readonly #members: Membership;

  constructor(sql: SqlStorage) {
    this.#members = new Membership(sql);
    this.#people = new Rows<PersonId, PersonRecord>(
      "person",
      personSchema,
      {
        read: (id) =>
          sql
            .exec<RawRow>("SELECT version, data FROM kinship_person WHERE id = ?", id)
            .toArray()[0],
        write: (id, version, data) => {
          sql.exec(
            `INSERT INTO kinship_person (id, version, data) VALUES (?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
            id,
            version,
            data,
          );
        },
        remove: (id) => {
          sql.exec("DELETE FROM kinship_person WHERE id = ?", id);
        },
      },
      ["children", "unions"],
    );
    this.#unions = new Rows<UnionId, UnionRecord>("union", unionSchema, {
      read: (id) =>
        sql.exec<RawRow>("SELECT version, data FROM kinship_union WHERE id = ?", id).toArray()[0],
      write: (id, version, data) => {
        sql.exec(
          `INSERT INTO kinship_union (id, version, data) VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
          id,
          version,
          data,
        );
      },
      remove: (id) => {
        sql.exec("DELETE FROM kinship_union WHERE id = ?", id);
      },
    });
    this.#branches = new Rows<BranchId, Branch>("branch", branchSchema, {
      read: (id) =>
        sql.exec<RawRow>("SELECT version, data FROM kinship_branch WHERE id = ?", id).toArray()[0],
      write: (id, version, data) => {
        sql.exec(
          `INSERT INTO kinship_branch (id, version, data, members) VALUES (?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
          id,
          version,
          data,
          JSON.stringify(nobody),
        );
      },
      remove: (id) => {
        sql.exec("DELETE FROM kinship_branch WHERE id = ?", id);
      },
    });
  }

  person(id: PersonId): Person | null {
    const record = this.#people.get(id);
    return record && { ...record, branch: this.#members.branchOf(id) };
  }

  union(id: UnionId): Union | null {
    const record = this.#unions.get(id);
    return record && { ...record, branch: this.#members.branchOf(id) };
  }

  branch(id: BranchId): Branch | null {
    return this.#branches.get(id);
  }

  parentsOf(id: PersonId): readonly Parentage[] {
    return this.#people.get(id)?.parents ?? [];
  }

  membersOf(id: BranchId): Members {
    return this.#members.membersOf(id);
  }

  save(change: Change): void {
    for (const write of change) {
      switch (write.kind) {
        case "person":
          this.#people.put(write.id, write.after);
          break;
        case "union":
          this.#unions.put(write.id, write.after);
          break;
        case "branch":
          this.#branches.put(write.id, write.after);
          break;
        case "person-branch":
        case "union-branch":
          this.#members.move(write.kind, write.id, write.after);
          break;
      }
    }
  }

  current(kind: string, id: string): number | string | null | undefined {
    switch (kind) {
      case "person":
        return this.#people.version(id as PersonId);
      case "union":
        return this.#unions.version(id as UnionId);
      case "branch":
        return this.#branches.version(id as BranchId);
      case "person-branch":
      case "union-branch":
        return this.#members.branchOf(id as PersonId | UnionId);
      default:
        return undefined;
    }
  }

  flush(version: number): Written[] {
    return [
      ...this.#people.flush(version),
      ...this.#unions.flush(version),
      ...this.#branches.flush(version),
      ...this.#members.flush(),
    ];
  }
}

const nobody: Members = { people: [], unions: [] };

/** Who is in which branch, kept with the branches: there are few of them, and they are read at once. */
class Membership {
  readonly #sql: SqlStorage;
  #loaded: Map<PersonId | UnionId, BranchId> | undefined;
  /** Where those who moved were. */
  readonly #moved = new Map<
    PersonId | UnionId,
    { kind: "person-branch" | "union-branch"; before: BranchId | null }
  >();

  constructor(sql: SqlStorage) {
    this.#sql = sql;
  }

  branchOf(id: PersonId | UnionId): BranchId | null {
    return this.#all.get(id) ?? null;
  }

  membersOf(id: BranchId): Members {
    const members: Members = { people: [], unions: [] };
    for (const [member, branch] of this.#all) {
      if (branch !== id) continue;
      if (isPerson(member)) members.people.push(member);
      else members.unions.push(member);
    }
    return members;
  }

  move(kind: "person-branch" | "union-branch", id: PersonId | UnionId, to: BranchId | null): void {
    if (!this.#moved.has(id)) this.#moved.set(id, { kind, before: this.branchOf(id) });
    if (to === null) this.#all.delete(id);
    else this.#all.set(id, to);
  }

  flush(): Written[] {
    const written = [...this.#moved].flatMap(([id, { kind, before }]): Written[] => {
      const after = this.branchOf(id);
      return before === after ? [] : [{ kind, id, before, after }];
    });
    const entered = new Set(written.map(({ after }) => after));
    for (const branch of new Set(written.flatMap(({ before, after }) => [before, after]))) {
      if (branch === null) continue;
      const members = membersSchema.safeParse(this.membersOf(branch as BranchId));
      if (!members.success) throw new BadWrite(`branch/${branch}`);
      const { rowsWritten } = this.#sql.exec(
        "UPDATE kinship_branch SET members = ? WHERE id = ?",
        JSON.stringify(members.data),
        branch,
      );
      // A branch that was left may have been removed, one that was entered has a row.
      if (rowsWritten === 0 && entered.has(branch)) throw new BadWrite(`branch/${branch}`);
    }
    return written;
  }

  get #all(): Map<PersonId | UnionId, BranchId> {
    if (this.#loaded !== undefined) return this.#loaded;
    const all = new Map<PersonId | UnionId, BranchId>();
    const rows = this.#sql.exec<{ id: string; members: string }>(
      "SELECT id, members FROM kinship_branch ORDER BY id",
    );
    for (const row of rows) {
      const id = branchIdSchema.safeParse(row.id);
      const members = membersSchema.safeParse(jsonOf(row.members));
      if (!id.success || !members.success) throw new CorruptRow(`branch/${row.id}`);
      for (const member of [...members.data.people, ...members.data.unions]) {
        if (all.has(member)) throw new CorruptRow(`branch/${row.id}`);
        all.set(member, id.data);
      }
    }
    this.#loaded = all;
    return all;
  }
}

function isPerson(id: PersonId | UnionId): id is PersonId {
  return id.startsWith("person_");
}
