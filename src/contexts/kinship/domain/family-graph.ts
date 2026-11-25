import { type Write, writes } from "../../../kernel/change";
import type { BranchId, PersonId, UnionId } from "../../../kernel/id";
import type { Branch } from "./branch";
import type { Parentage, Person } from "./person";
import type { Union } from "./union";

/** The family as the rules read it, one aggregate at a time. */
export interface FamilyGraph {
  person(id: PersonId): Person | null;
  union(id: UnionId): Union | null;
  branch(id: BranchId): Branch | null;
  /** The parents of a person, for a walk up that needs nothing else. */
  parentsOf(id: PersonId): readonly Parentage[];
  membersOf(id: BranchId): Members;
}

/** Who is in a branch. */
export type Members = { people: PersonId[]; unions: UnionId[] };

/** A branch may be given to hundreds at once, so it is told apart from whoever is in it. */
export type PersonRecord = Omit<Person, "branch">;
export type UnionRecord = Omit<Union, "branch">;

/**
 * What a rule makes of the family, each aggregate once and only if it differs. Written in this order
 * it makes the family after, and with before for after in the reverse order the family before. Where
 * it is stored, versions are counted: here they stay as they were.
 */
export type Change = (
  | Write<"person", PersonId, PersonRecord>
  | Write<"person-branch", PersonId, BranchId>
  | Write<"union", UnionId, UnionRecord>
  | Write<"union-branch", UnionId, BranchId>
  | Write<"branch", BranchId, Branch>
)[];

/** Changes to the family that nobody has stored yet. */
export class Draft {
  readonly #graph: FamilyGraph;
  readonly #stored = new Map<PersonId, Person | null>();
  readonly #people = new Map<PersonId, Person>();
  readonly #unions = new Map<UnionId, Union | null>();
  readonly #branches = new Map<BranchId, Branch | null>();

  constructor(graph: FamilyGraph) {
    this.#graph = graph;
  }

  /** A person with the changes. Each is read once. */
  person(id: PersonId): Person | null {
    return this.#people.get(id) ?? this.#storedPerson(id);
  }

  putPerson(person: Person): void {
    this.#people.set(person.id, person);
  }

  /** Changes a person who is there; somebody else's end of a link may be unknown. */
  editPerson(id: PersonId | "unknown", edit: (person: Person) => Partial<Person>): void {
    const person = id === "unknown" ? null : this.person(id);
    if (person !== null) this.putPerson({ ...person, ...edit(person) });
  }

  putUnion(union: Union): void {
    this.#unions.set(union.id, union);
  }

  removeUnion(id: UnionId): void {
    this.#unions.set(id, null);
  }

  putBranch(branch: Branch): void {
    this.#branches.set(branch.id, branch);
  }

  removeBranch(id: BranchId): void {
    this.#branches.set(id, null);
  }

  change(): Change {
    const change: Change = [];
    for (const [id, person] of this.#people) {
      const stored = this.#storedPerson(id);
      change.push(...writes("person", id, stored && withoutBranch(stored), withoutBranch(person)));
      change.push(...writes("person-branch", id, stored?.branch ?? null, person.branch));
    }
    for (const [id, after] of this.#unions) {
      const before = this.#graph.union(id);
      change.push(
        ...writes("union", id, before && withoutBranch(before), after && withoutBranch(after)),
      );
      change.push(...writes("union-branch", id, before?.branch ?? null, after?.branch ?? null));
    }
    for (const [id, after] of this.#branches) {
      change.push(...writes("branch", id, this.#graph.branch(id), after));
    }
    return change;
  }

  #storedPerson(id: PersonId): Person | null {
    const known = this.#stored.get(id);
    if (known !== undefined) return known;
    const person = this.#graph.person(id);
    this.#stored.set(id, person);
    return person;
  }
}

function withoutBranch<T extends { branch: BranchId | null }>(value: T): Omit<T, "branch"> {
  const { branch: _branch, ...record } = value;
  return record;
}
