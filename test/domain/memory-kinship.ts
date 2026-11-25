import {
  type Branch,
  type Change,
  type Kinship,
  type KinshipCommand,
  type KinshipStore,
  kinshipOver,
  type Parentage,
  type Person,
  type Union,
} from "../../src/contexts/kinship";
import type { BranchId, PersonId, UnionId } from "../../src/kernel/id";

/** A store that holds copies, as a database does: nobody can change what it holds but by `save`. */
export class MemoryKinship implements KinshipStore {
  readonly people = new Map<PersonId, Person>();
  readonly unions = new Map<UnionId, Union>();
  readonly branches = new Map<BranchId, Branch>();
  /** Whose parents were asked for, and who was read. */
  asked: PersonId[] = [];
  read: PersonId[] = [];
  saves = 0;

  person(id: PersonId): Person | null {
    this.read.push(id);
    return structuredClone(this.people.get(id) ?? null);
  }

  union(id: UnionId): Union | null {
    return structuredClone(this.unions.get(id) ?? null);
  }

  branch(id: BranchId): Branch | null {
    return structuredClone(this.branches.get(id) ?? null);
  }

  parentsOf(id: PersonId): Parentage[] {
    this.asked.push(id);
    return structuredClone(this.people.get(id)?.parents ?? []);
  }

  save(change: Change): void {
    this.saves++;
    for (const write of structuredClone(change)) {
      switch (write.kind) {
        case "person": {
          const branch = this.people.get(write.id)?.branch ?? null;
          if (write.after === null) this.people.delete(write.id);
          else this.people.set(write.id, { ...write.after, branch });
          break;
        }
        case "person-branch": {
          const person = this.people.get(write.id);
          if (person === undefined) throw new Error(`no ${write.id}`);
          person.branch = write.after;
          break;
        }
        case "union":
          if (write.after === null) this.unions.delete(write.id);
          else this.unions.set(write.id, write.after);
          break;
        case "branch":
          if (write.after === null) this.branches.delete(write.id);
          else this.branches.set(write.id, write.after);
          break;
      }
    }
  }

  snapshot(): unknown {
    return structuredClone({
      people: this.people,
      unions: this.unions,
      branches: this.branches,
    });
  }
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
