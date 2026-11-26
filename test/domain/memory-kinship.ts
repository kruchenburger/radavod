import {
  type Branch,
  type Change,
  type Kinship,
  type KinshipCommand,
  type KinshipStore,
  kinshipOver,
  type Members,
  type Parentage,
  type Person,
  type PersonRecord,
  type Union,
  type UnionRecord,
} from "../../src/contexts/kinship";
import type { BranchId, PersonId, UnionId } from "../../src/kernel/id";

/** A store that holds copies, as a database does: nobody can change what it holds but by `save`. */
export class MemoryKinship implements KinshipStore {
  readonly people = new Map<PersonId, PersonRecord>();
  readonly unions = new Map<UnionId, UnionRecord>();
  readonly branches = new Map<BranchId, Branch>();
  readonly branchOf = new Map<PersonId | UnionId, BranchId>();
  /** Whose parents were asked for, and who was read. */
  asked: PersonId[] = [];
  read: PersonId[] = [];
  saves = 0;

  person(id: PersonId): Person | null {
    this.read.push(id);
    const record = this.people.get(id);
    return record === undefined
      ? null
      : structuredClone({ ...record, branch: this.branchOf.get(id) ?? null });
  }

  union(id: UnionId): Union | null {
    const record = this.unions.get(id);
    return record === undefined
      ? null
      : structuredClone({ ...record, branch: this.branchOf.get(id) ?? null });
  }

  branch(id: BranchId): Branch | null {
    return structuredClone(this.branches.get(id) ?? null);
  }

  parentsOf(id: PersonId): Parentage[] {
    this.asked.push(id);
    return structuredClone(this.people.get(id)?.parents ?? []);
  }

  membersOf(id: BranchId): Members {
    const of = <Id extends PersonId | UnionId>(ids: Iterable<Id>) =>
      [...ids].filter((one) => this.branchOf.get(one) === id);
    return { people: of(this.people.keys()), unions: of(this.unions.keys()) };
  }

  someone(): boolean {
    return this.people.size > 0;
  }

  save(change: Change): void {
    this.saves++;
    for (const write of structuredClone(change)) {
      switch (write.kind) {
        case "person":
          put(this.people, write.id, write.after);
          break;
        case "union":
          put(this.unions, write.id, write.after);
          break;
        case "branch":
          put(this.branches, write.id, write.after);
          break;
        case "person-branch":
        case "union-branch":
          put(this.branchOf, write.id, write.after);
          break;
      }
    }
  }

  snapshot(): unknown {
    const { people, unions, branches, branchOf } = this;
    return structuredClone({ people, unions, branches, branchOf });
  }
}

function put<Id, Value>(rows: Map<Id, Value>, id: Id, value: Value | null): void {
  if (value === null) rows.delete(id);
  else rows.set(id, value);
}

export const person = (name: string): PersonId => `person_${name}` as PersonId;
export const union = (name: string): UnionId => `union_${name}` as UnionId;
export const branch = (name: string): BranchId => `branch_${name}` as BranchId;

/** A family to give commands to, with short words for the usual ones. */
export class Family {
  readonly store = new MemoryKinship();
  readonly kinship: Kinship = kinshipOver(this.store);

  constructor(...names: string[]) {
    for (const name of names) this.add(name);
  }

  apply(command: KinshipCommand) {
    return this.kinship.apply(command);
  }

  /** Applies a command that must be accepted. */
  do(command: KinshipCommand): Change {
    const result = this.apply(command);
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
    return result.value;
  }

  add(name: string): void {
    this.do({
      do: "add-person",
      person: { id: person(name), sex: "unknown", living: "unknown", names: [], mainName: null },
      branch: null,
    });
  }

  addParent(child: string, parent: string, more: Partial<Parentage> = {}) {
    return this.apply(parentCommand(child, parent, more));
  }

  withParent(child: string, parent: string, more: Partial<Parentage> = {}): void {
    this.do(parentCommand(child, parent, more));
  }

  withUnion(id: string, first: string, second: string): void {
    this.do({
      do: "add-union",
      union: {
        id: union(id),
        partners: [person(first), second === "unknown" ? "unknown" : person(second)],
        kind: "marriage",
        branch: null,
        certainty: "hypothesis",
      },
    });
  }

  withBranch(id: string): void {
    this.do({
      do: "add-branch",
      branch: { id: branch(id), title: { ru: id, en: id }, color: 0 },
    });
  }

  get(name: string): Person {
    const found = this.kinship.get(person(name));
    if (found === null) throw new Error(`no ${name}`);
    return found;
  }
}

function parentCommand(child: string, parent: string, more: Partial<Parentage>): KinshipCommand {
  return {
    do: "add-parent",
    child: person(child),
    parentage: {
      id: `${child}-${parent}`,
      parent: parent === "unknown" ? "unknown" : person(parent),
      union: null,
      kind: "blood",
      main: true,
      certainty: "hypothesis",
      ...more,
    },
  };
}
