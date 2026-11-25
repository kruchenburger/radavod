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
}

/** One aggregate before and after. Null stands for one that is not there. */
type Write<Kind extends string, Id, Value> = {
  kind: Kind;
  id: Id;
  before: Value | null;
  after: Value | null;
};

/** A branch may have hundreds of members, so who is in it is told apart from the person. */
export type PersonRecord = Omit<Person, "branch">;

/**
 * What a rule makes of the family, each aggregate once and only if it differs. Versions are counted
 * where a change is stored.
 */
export type Change = (
  | Write<"person", PersonId, PersonRecord>
  | Write<"member", PersonId, BranchId>
  | Write<"union", UnionId, Union>
  | Write<"branch", BranchId, Branch>
)[];

/** Changes to the family that nobody has stored yet. */
export class Draft {
  readonly #graph: FamilyGraph;
  readonly #people = new Map<PersonId, Person>();
  readonly #unions = new Map<UnionId, Union | null>();
  readonly #branches = new Map<BranchId, Branch>();

  constructor(graph: FamilyGraph) {
    this.#graph = graph;
  }

  putPerson(person: Person): void {
    this.#people.set(person.id, person);
  }

  /** Changes a person who is there; somebody else's end of a link may be unknown. */
  editPerson(id: PersonId | "unknown", edit: (person: Person) => Partial<Person>): void {
    const person = id === "unknown" ? null : (this.#people.get(id) ?? this.#graph.person(id));
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

  change(): Change {
    const change: Change = [];
    for (const [id, person] of this.#people) {
      const stored = this.#graph.person(id);
      const [before, after] = [stored && recordOf(stored), recordOf(person)];
      if (differ(before, after)) change.push({ kind: "person", id, before, after });
      const [from, to] = [stored?.branch ?? null, person.branch];
      if (from !== to) change.push({ kind: "member", id, before: from, after: to });
    }
    for (const [id, after] of this.#unions) {
      const before = this.#graph.union(id);
      if (differ(before, after)) change.push({ kind: "union", id, before, after });
    }
    for (const [id, after] of this.#branches) {
      const before = this.#graph.branch(id);
      if (differ(before, after)) change.push({ kind: "branch", id, before, after });
    }
    return change;
  }
}

function recordOf(person: Person): PersonRecord {
  const { id, version, sex, living, names, mainName, parents, children, unions, childOrder } =
    person;
  return { id, version, sex, living, names, mainName, parents, children, unions, childOrder };
}

/** Aggregates are plain data that is copied with its keys in order. */
function differ(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
