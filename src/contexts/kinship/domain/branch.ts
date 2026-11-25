import type { BranchId, PersonId } from "../../../kernel/id";
import type { Result } from "../../../kernel/result";
import { type Change, Draft, type FamilyGraph } from "./family-graph";
import { type Duplicate, duplicate, type Missing, missing } from "./refusal";

export type Branch = {
  id: BranchId;
  version: number;
  title: { ru: string; en: string };
  /** Which of the twelve branch inks of docs/design.md, from 0 to 11. */
  color: number;
};

export type NewBranch = Omit<Branch, "version">;
export type BranchPatch = Partial<Omit<Branch, "id" | "version">>;

/** Whom to give a branch to, or take it from when it is null. */
export type Assignment = {
  person: PersonId;
  branch: BranchId | null;
  descendants: boolean;
  /** Also those descendants who have a branch. */
  overwrite: boolean;
};

export function addBranch(g: FamilyGraph, branch: NewBranch): Result<Change, Duplicate> {
  if (g.branch(branch.id) !== null) return duplicate;
  const draft = new Draft(g);
  draft.putBranch({ ...branch, version: 0 });
  return { ok: true, value: draft.change() };
}

export function editBranch(
  g: FamilyGraph,
  id: BranchId,
  patch: BranchPatch,
): Result<Change, Missing> {
  const branch = g.branch(id);
  if (branch === null) return missing(id);
  const draft = new Draft(g);
  draft.putBranch({ ...branch, ...patch });
  return { ok: true, value: draft.change() };
}

/**
 * The person gets the branch whatever they had. A descendant who has one keeps it unless told to
 * overwrite, and those below get theirs all the same.
 */
export function assignBranch(
  g: FamilyGraph,
  { person, branch, descendants, overwrite }: Assignment,
): Result<Change, Missing> {
  const first = g.person(person);
  if (first === null) return missing(person);
  if (branch !== null && g.branch(branch) === null) return missing(branch);
  const draft = new Draft(g);
  draft.putPerson({ ...first, branch });
  if (!descendants) return { ok: true, value: draft.change() };

  const found = new Set([person]);
  // A set goes on to what is added while it is walked.
  for (const id of found) {
    for (const child of g.person(id)?.children ?? []) {
      const one = g.person(child);
      const isChild = one?.parents.some(
        ({ parent, kind, main }) => parent === id && main && kind !== "guardianship",
      );
      if (one === null || !isChild) continue;
      found.add(child);
      if (overwrite || one.branch === null) draft.putPerson({ ...one, branch });
    }
  }
  return { ok: true, value: draft.change() };
}
