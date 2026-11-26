import type { BranchId, PersonId, UnionId } from "../../../kernel/id";
import type { NameForm } from "../../../kernel/name-form";
import type { Result } from "../../../kernel/result";
import {
  addBranch,
  type Assignment,
  assignBranch,
  type Branch,
  type BranchPatch,
  editBranch,
  type NewBranch,
  removeBranch,
} from "../domain/branch";
import type { Change, FamilyGraph } from "../domain/family-graph";
import {
  type FamilyTarget,
  type PutBackError,
  putFamilyBack,
  removePerson,
} from "../domain/put-back";
import {
  addParent,
  editParent,
  type ParentageError,
  type ParentagePatch,
  removeParent,
} from "../domain/parentage";
import {
  addPerson,
  editPerson,
  type NewPerson,
  type NotAChild,
  orderChildren,
  type Parentage,
  type Person,
  type PersonPatch,
  putName,
  relativesOf,
  removeName,
} from "../domain/person";
import {
  addUnion,
  editUnion,
  type NewUnion,
  removeUnion,
  type Union,
  type UnionError,
  type UnionPatch,
} from "../domain/union";
import type { KinshipStore } from "./ports";

export type KinshipCommand =
  | { do: "add-person"; person: NewPerson; branch: BranchId | null }
  | { do: "edit-person"; id: PersonId; patch: PersonPatch }
  | { do: "remove-person"; id: PersonId }
  | { do: "put-name"; person: PersonId; name: NameForm }
  | { do: "remove-name"; person: PersonId; id: string }
  | { do: "order-children"; person: PersonId; order: PersonId[] }
  | { do: "add-parent"; child: PersonId; parentage: Parentage }
  | { do: "edit-parent"; child: PersonId; id: string; patch: ParentagePatch }
  | { do: "remove-parent"; child: PersonId; id: string }
  | { do: "add-union"; union: NewUnion }
  | { do: "edit-union"; id: UnionId; patch: UnionPatch }
  | { do: "remove-union"; id: UnionId }
  | { do: "add-branch"; branch: NewBranch }
  | { do: "edit-branch"; id: BranchId; patch: BranchPatch }
  | { do: "remove-branch"; id: BranchId }
  | ({ do: "assign-branch" } & Assignment);

export type KinshipError = ParentageError | UnionError | NotAChild | PutBackError;

export interface Kinship {
  get(id: PersonId): Person | null;
  union(id: UnionId): Union | null;
  branch(id: BranchId): Branch | null;
  /** Everybody a link ties to a person: parents, partners, children. */
  relatives(id: PersonId): PersonId[];
  /** Whether anybody is in the tree. */
  someone(): boolean;
  /** Stores what the rules make of a command. One that is refused or changes nothing is not. */
  apply(command: KinshipCommand): Result<Change, KinshipError>;
  /** Puts aggregates as they were, with what follows from them. */
  putBack(targets: readonly FamilyTarget[]): Result<Change, KinshipError>;
}

export function kinshipOver(store: KinshipStore): Kinship {
  const saved = (result: Result<Change, KinshipError>) => {
    if (result.ok && result.value.length > 0) store.save(result.value);
    return result;
  };
  return {
    get: (id) => store.person(id),
    union: (id) => store.union(id),
    branch: (id) => store.branch(id),
    relatives: (id) => relativesOf(store, id),
    someone: () => store.someone(),
    apply: (command) => saved(resultOf(store, command)),
    putBack: (targets) => saved(putFamilyBack(store, targets)),
  };
}

function resultOf(g: FamilyGraph, command: KinshipCommand): Result<Change, KinshipError> {
  switch (command.do) {
    case "add-person":
      return addPerson(g, command.person, command.branch);
    case "edit-person":
      return editPerson(g, command.id, command.patch);
    case "remove-person":
      return removePerson(g, command.id);
    case "put-name":
      return putName(g, command.person, command.name);
    case "remove-name":
      return removeName(g, command.person, command.id);
    case "order-children":
      return orderChildren(g, command.person, command.order);
    case "add-parent":
      return addParent(g, command.child, command.parentage);
    case "edit-parent":
      return editParent(g, command.child, command.id, command.patch);
    case "remove-parent":
      return removeParent(g, command.child, command.id);
    case "add-union":
      return addUnion(g, command.union);
    case "edit-union":
      return editUnion(g, command.id, command.patch);
    case "remove-union":
      return removeUnion(g, command.id);
    case "add-branch":
      return addBranch(g, command.branch);
    case "edit-branch":
      return editBranch(g, command.id, command.patch);
    case "remove-branch":
      return removeBranch(g, command.id);
    case "assign-branch":
      return assignBranch(g, command);
  }
}
