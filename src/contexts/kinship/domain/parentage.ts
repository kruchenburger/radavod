import type { PersonId } from "../../../kernel/id";
import type { Result } from "../../../kernel/result";
import { type Change, Draft, type FamilyGraph } from "./family-graph";
import type { Parentage, Person } from "./person";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import { newcomers } from "./sets";

export type ParentageError =
  /** From the child back to the child, each a parent of the one before. */
  | { code: "cycle"; path: PersonId[] }
  | { code: "third-main-blood-parent" }
  /** The union is not one of that parent. An unknown parent has none: nothing leads to the child. */
  | { code: "not-a-partner" }
  | Duplicate
  | Missing;

export type ParentagePatch = Partial<Omit<Parentage, "id">>;

const mainBloodParents = 2;

export function addParent(
  g: FamilyGraph,
  child: PersonId,
  parentage: Parentage,
): Result<Change, ParentageError> {
  const person = g.person(child);
  if (person === null) return missing(child);
  if (person.parents.some(({ id }) => id === parentage.id)) return duplicate;
  const error = refusalOf(g, child, parentage, person.parents);
  if (error !== null) return { ok: false, error };
  return { ok: true, value: changed(g, person, [...person.parents, parentage]) };
}

export function editParent(
  g: FamilyGraph,
  child: PersonId,
  id: string,
  patch: ParentagePatch,
): Result<Change, ParentageError> {
  const person = g.person(child);
  if (person === null) return missing(child);
  const parentage = person.parents.find((one) => one.id === id);
  if (parentage === undefined) return missing(id);
  const edited: Parentage = { ...parentage, ...patch };
  const others = person.parents.filter((one) => one !== parentage);
  const error = refusalOf(g, child, edited, others);
  if (error !== null) return { ok: false, error };
  const parents = person.parents.map((one) => (one === parentage ? edited : one));
  return { ok: true, value: changed(g, person, parents) };
}

export function removeParent(g: FamilyGraph, child: PersonId, id: string): Result<Change, Missing> {
  const person = g.person(child);
  if (person === null) return missing(child);
  const others = person.parents.filter((one) => one.id !== id);
  if (others.length === person.parents.length) return missing(id);
  return { ok: true, value: changed(g, person, others) };
}

/** Why a child cannot have a parentage beside the others, or null. */
function refusalOf(
  g: FamilyGraph,
  child: PersonId,
  parentage: Parentage,
  others: readonly Parentage[],
): ParentageError | null {
  const { parent, union, kind, main } = parentage;
  if (parent !== "unknown" && g.person(parent) === null) return missing(parent).error;
  if (union !== null) {
    const found = g.union(union);
    if (found === null) return missing(union).error;
    if (parent === "unknown" || !found.partners.includes(parent)) return { code: "not-a-partner" };
  }
  if (parent !== "unknown") {
    const isSame = (one: Parentage) => one.parent === parent && one.kind === kind;
    if (others.some(isSame)) return duplicate.error;
    const path = cycleOf(g, child, parent, descends(parentage));
    if (path !== null) return { code: "cycle", path };
  }
  const isMainBlood = kind === "blood" && main;
  const taken = others.filter((one) => one.kind === "blood" && one.main).length;
  return isMainBlood && taken >= mainBloodParents ? { code: "third-main-blood-parent" } : null;
}

/** Whether a parentage makes an ancestor: guardianship and an unknown kind may go in a circle. */
export function descends({ kind }: Parentage): boolean {
  return kind === "blood" || kind === "adoption";
}

/**
 * The shortest way from the child back to the child, if the parent becomes one. It walks up from the
 * parent and asks for the parents of each ancestor once. Nobody is a parent of their own, of any kind.
 */
function cycleOf(
  g: FamilyGraph,
  child: PersonId,
  parent: PersonId,
  isDescent: boolean,
): PersonId[] | null {
  if (parent === child) return [child, child];
  if (!isDescent) return null;
  /** Whose parent each is found as. */
  const below = new Map<PersonId, PersonId>([[parent, child]]);
  // A map goes on to what is added while it is walked.
  for (const [ancestor] of below) {
    for (const link of g.parentsOf(ancestor)) {
      if (link.parent === "unknown" || !descends(link)) continue;
      if (link.parent === child) return wayUp(below, child, ancestor);
      if (!below.has(link.parent)) below.set(link.parent, ancestor);
    }
  }
  return null;
}

function wayUp(below: Map<PersonId, PersonId>, child: PersonId, last: PersonId): PersonId[] {
  const path = [child];
  for (let at = last; at !== child; at = below.get(at) ?? child) path.push(at);
  return [...path, child].reverse();
}

/** Gives a child its parents, and each parent the child. */
function changed(g: FamilyGraph, person: Person, parents: Parentage[]): Change {
  const draft = new Draft(g);
  draft.putPerson({ ...person, parents });
  const idsOf = (list: readonly Parentage[]) => new Set(list.map(({ parent }) => parent));
  const [before, after] = [idsOf(person.parents), idsOf(parents)];
  for (const parent of newcomers(before, after)) {
    draft.editPerson(parent, ({ children }) => ({ children: [...children, person.id] }));
  }
  for (const parent of newcomers(after, before)) {
    draft.editPerson(parent, ({ children, childOrder }) => ({
      children: children.filter((child) => child !== person.id),
      childOrder: childOrder.filter((child) => child !== person.id),
    }));
  }
  return draft.change();
}
