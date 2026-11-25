import type { BranchId, PersonId, UnionId } from "../../../kernel/id";
import { type InUse, inUse, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import type { Branch } from "./branch";
import { type Change, Draft, type FamilyGraph, type UnionRecord } from "./family-graph";
import { type ParentageError, refusalOf } from "./parentage";
import type { Person } from "./person";
import { newcomers } from "./sets";
import type { UnionError } from "./union";

/** What somebody wrote about a person. The rest follows from other aggregates. */
export type PersonWritten = Pick<
  Person,
  "sex" | "living" | "names" | "mainName" | "parents" | "childOrder"
>;

/** An aggregate as it was, or null when it was not there. */
export type FamilyTarget =
  | { kind: "person"; id: PersonId; value: PersonWritten | null }
  | { kind: "union"; id: UnionId; value: Omit<UnionRecord, "id" | "version"> | null }
  | { kind: "branch"; id: BranchId; value: Omit<Branch, "id" | "version"> | null }
  | { kind: "person-branch"; id: PersonId; value: BranchId | null }
  | { kind: "union-branch"; id: UnionId; value: BranchId | null };

export type PutBackError = ParentageError | UnionError | InUse;

/** Puts aggregates as they were, with what follows from them. The result is as possible as any other. */
export function putFamilyBack(
  g: FamilyGraph,
  targets: readonly FamilyTarget[],
): Result<Change, PutBackError> {
  const draft = new Draft(g);
  const people: PersonId[] = [];
  const unions: UnionId[] = [];
  const branches: BranchId[] = [];
  for (const target of targets) {
    if (target.kind === "branch") {
      branches.push(target.id);
      const version = g.branch(target.id)?.version ?? 0;
      if (target.value === null) draft.removeBranch(target.id);
      else draft.putBranch({ ...target.value, id: target.id, version });
    } else if (target.kind === "person") {
      people.push(target.id);
      putPerson(g, draft, target.id, target.value);
    } else if (target.kind === "union") {
      unions.push(target.id);
      const { version = 0, branch = null } = g.union(target.id) ?? {};
      if (target.value === null) draft.removeUnion(target.id);
      else draft.putUnion({ ...target.value, id: target.id, version, branch });
    }
  }
  for (const id of people) mirrorParents(g, draft, id);
  for (const id of unions) mirrorPartners(g, draft, id);
  for (const target of targets) {
    if (target.kind === "person-branch") {
      if (target.value !== null && draft.person(target.id) === null) return missing(target.id);
      draft.editPerson(target.id, () => ({ branch: target.value }));
    } else if (target.kind === "union-branch") {
      const union = draft.union(target.id);
      if (union !== null) draft.putUnion({ ...union, branch: target.value });
      else if (target.value !== null) return missing(target.id);
    }
  }
  for (const id of draft.drafted) {
    draft.editPerson(id, ({ children, childOrder }) => ({
      childOrder: childOrder.filter((child) => children.includes(child)),
    }));
  }
  return (
    wrongPerson(g, draft, people) ??
    wrongUnion(g, draft, unions) ??
    wrongBranch(draft, targets, branches) ?? { ok: true, value: draft.change() }
  );
}

/** Removes a person nobody names: no child, no union. Their own parents are forgotten with them. */
export function removePerson(g: FamilyGraph, id: PersonId): Result<Change, PutBackError> {
  return g.person(id) === null
    ? missing(id)
    : putFamilyBack(g, [{ kind: "person", id, value: null }]);
}

function putPerson(g: FamilyGraph, draft: Draft, id: PersonId, value: PersonWritten | null): void {
  if (value === null) {
    draft.removePerson(id);
    return;
  }
  const stored = g.person(id);
  const { version = 0, branch = null, children = [], unions = [] } = stored ?? {};
  const isShown = value.names.some((name) => name.id === value.mainName);
  // Of two edits one may be taken back: a name that is shown is one that is there.
  const mainName = isShown ? value.mainName : (value.names[0]?.id ?? null);
  draft.putPerson({ ...value, mainName, id, version, branch, children, unions });
}

function mirrorParents(g: FamilyGraph, draft: Draft, child: PersonId): void {
  const of = (person: Person | null) => new Set(person?.parents.map(({ parent }) => parent));
  const [before, after] = [of(g.person(child)), of(draft.person(child))];
  for (const parent of newcomers(before, after)) {
    draft.editPerson(parent, ({ children }) => ({ children: [...children, child] }));
  }
  for (const parent of newcomers(after, before)) {
    draft.editPerson(parent, ({ children }) => ({
      children: children.filter((one) => one !== child),
    }));
  }
}

function mirrorPartners(g: FamilyGraph, draft: Draft, id: UnionId): void {
  const [before, after] = [new Set(g.union(id)?.partners), new Set(draft.union(id)?.partners)];
  for (const partner of newcomers(before, after)) {
    draft.editPerson(partner, ({ unions }) => ({ unions: [...unions, id] }));
  }
  for (const partner of newcomers(after, before)) {
    draft.editPerson(partner, ({ unions }) => ({ unions: unions.filter((one) => one !== id) }));
  }
}

type Refusal = { ok: false; error: PutBackError } | null;

function wrongPerson(g: FamilyGraph, draft: Draft, people: readonly PersonId[]): Refusal {
  for (const id of people) {
    const person = draft.person(id);
    if (person === null) {
      const count = linksTo(g, draft, id);
      if (count > 0) return inUse(count);
      continue;
    }
    for (const link of person.parents) {
      const others = person.parents.filter((one) => one !== link);
      const error = refusalOf(draft, id, link, others);
      if (error !== null) return { ok: false, error };
    }
  }
  return null;
}

/** How many children and unions of a person who goes still name them. */
function linksTo(g: FamilyGraph, draft: Draft, id: PersonId): number {
  const { children = [], unions = [] } = g.person(id) ?? {};
  const left = children.filter((child) =>
    draft.person(child)?.parents.some(({ parent }) => parent === id),
  );
  return left.length + unions.filter((one) => draft.union(one)?.partners.includes(id)).length;
}

function wrongUnion(g: FamilyGraph, draft: Draft, unions: readonly UnionId[]): Refusal {
  for (const id of unions) {
    const union = draft.union(id);
    const [first, second] = union?.partners ?? [];
    if (union !== null && first === second) return { ok: false, error: { code: "same-person" } };
    for (const partner of union?.partners ?? []) {
      if (partner !== "unknown" && draft.person(partner) === null) return missing(partner);
    }
    const partners = new Set([...(g.union(id)?.partners ?? []), ...(union?.partners ?? [])]);
    const children = [...partners].flatMap((partner) =>
      partner === "unknown" ? [] : (draft.person(partner)?.children ?? []),
    );
    for (const child of new Set(children)) {
      for (const { union: of, parent } of draft.person(child)?.parents ?? []) {
        if (of !== id) continue;
        if (union === null) return inUse(1);
        if (parent === "unknown" || !union.partners.includes(parent)) {
          return { ok: false, error: { code: "not-a-partner" } };
        }
      }
    }
  }
  return null;
}

function wrongBranch(
  draft: Draft,
  targets: readonly FamilyTarget[],
  branches: readonly BranchId[],
): { ok: false; error: Missing | InUse } | null {
  for (const id of branches) {
    const { people, unions } = draft.membersOf(id);
    const count = people.length + unions.length;
    if (draft.branch(id) === null && count > 0) return inUse(count);
  }
  for (const { kind, value } of targets) {
    if (kind !== "person-branch" && kind !== "union-branch") continue;
    if (value !== null && draft.branch(value) === null) return missing(value);
  }
  return null;
}
