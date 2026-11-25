import type { Certainty } from "../../../kernel/certainty";
import type { BranchId, PersonId, UnionId } from "../../../kernel/id";
import type { Result } from "../../../kernel/result";
import { type Change, Draft, type FamilyGraph } from "./family-graph";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import { newcomers } from "./sets";

/** Two people as a couple. Relatives may be one, and the same two may be one again. */
export type Union = {
  id: UnionId;
  version: number;
  partners: [PersonId, PersonId | "unknown"];
  kind: "marriage" | "civil" | "unknown";
  /** The branch the couple was given, whatever branches the two belong to. */
  branch: BranchId | null;
  certainty: Certainty;
};

export type NewUnion = Omit<Union, "version">;
export type UnionPatch = Partial<Omit<Union, "id" | "version">>;
export type UnionError = { code: "same-person" } | Duplicate | Missing;

export function addUnion(g: FamilyGraph, union: NewUnion): Result<Change, UnionError> {
  if (g.union(union.id) !== null) return duplicate;
  return changed(g, null, { ...union, version: 0 });
}

export function editUnion(
  g: FamilyGraph,
  id: UnionId,
  patch: UnionPatch,
): Result<Change, UnionError> {
  const union = g.union(id);
  return union === null ? missing(id) : changed(g, union, { ...union, ...patch });
}

export function removeUnion(g: FamilyGraph, id: UnionId): Result<Change, UnionError> {
  const union = g.union(id);
  return union === null ? missing(id) : changed(g, union, null);
}

/** Puts a union in the place of another, at the partners of both and at their children. */
function changed(
  g: FamilyGraph,
  before: Union | null,
  after: Union | null,
): Result<Change, UnionError> {
  const draft = new Draft(g);
  const id = before?.id ?? after?.id;
  if (id === undefined) return { ok: true, value: [] };
  if (after === null) draft.removeUnion(id);
  else {
    const { partners, branch } = after;
    if (partners[0] === partners[1]) return { ok: false, error: { code: "same-person" } };
    for (const partner of partners) {
      if (partner !== "unknown" && g.person(partner) === null) return missing(partner);
    }
    if (branch !== null && g.branch(branch) === null) return missing(branch);
    draft.putUnion(after);
  }

  const [old, now] = [new Set(before?.partners), new Set(after?.partners)];
  for (const partner of newcomers(old, now)) {
    draft.editPerson(partner, ({ unions }) => ({ unions: [...unions, id] }));
  }
  const gone = newcomers(now, old);
  for (const partner of gone) {
    draft.editPerson(partner, ({ unions }) => ({ unions: unions.filter((one) => one !== id) }));
  }
  if (gone.length > 0) {
    // Children stay children, but not of a union their parent is not in.
    const children = [...old].flatMap((partner) =>
      partner === "unknown" ? [] : (g.person(partner)?.children ?? []),
    );
    for (const child of new Set(children)) {
      draft.editPerson(child, ({ parents }) => ({
        parents: parents.map((link) =>
          link.union === id && gone.includes(link.parent) ? { ...link, union: null } : link,
        ),
      }));
    }
  }
  return { ok: true, value: draft.change() };
}
