import type { Certainty } from "../../../kernel/certainty";
import type { BranchId, PersonId, UnionId } from "../../../kernel/id";
import type { NameForm } from "../../../kernel/name-form";
import type { Result } from "../../../kernel/result";
import { type Change, Draft, type FamilyGraph } from "./family-graph";
import { type Duplicate, duplicate, type Missing, missing } from "./refusal";

export type Person = {
  id: PersonId;
  version: number;
  sex: "male" | "female" | "other" | "unknown";
  living: "yes" | "no" | "unknown";
  names: NameForm[];
  /** The identifier of the name shown. */
  mainName: string | null;
  branch: BranchId | null;
  parents: Parentage[];
  /** Everybody who has this person for a parent, of any kind and version. */
  children: PersonId[];
  unions: UnionId[];
  /** Children in an order set by hand. Whoever is not in it stands by birth. */
  childOrder: PersonId[];
};

/** One link from a child to a parent, kept with the child. */
export type Parentage = {
  id: string;
  parent: PersonId | "unknown";
  /** The union of the parent the child was born or taken into, when both are known. */
  union: UnionId | null;
  kind: "blood" | "adoption" | "guardianship" | "unknown";
  /** False for a version that contradicts the main one. */
  main: boolean;
  certainty: Certainty;
};

export type NewPerson = Pick<Person, "id" | "sex" | "living" | "names" | "mainName">;
export type PersonPatch = Partial<Pick<Person, "sex" | "living" | "mainName">>;
export type NotAChild = { code: "not-a-child"; id: PersonId };

export function addPerson(
  g: FamilyGraph,
  person: NewPerson,
  branch: BranchId | null,
): Result<Change, Missing | Duplicate> {
  if (g.person(person.id) !== null) return duplicate;
  if (branch !== null && g.branch(branch) === null) return missing(branch);
  const ids = person.names.map(({ id }) => id);
  if (new Set(ids).size < ids.length) return duplicate;
  const { id, sex, living, names, mainName } = person;
  if (mainName !== null && !ids.includes(mainName)) return missing(mainName);
  const draft = new Draft(g);
  draft.putPerson({
    id,
    version: 0,
    sex,
    living,
    names,
    mainName,
    branch,
    parents: [],
    children: [],
    unions: [],
    childOrder: [],
  });
  return { ok: true, value: draft.change() };
}

export function editPerson(
  g: FamilyGraph,
  id: PersonId,
  patch: PersonPatch,
): Result<Change, Missing> {
  return editing(g, id, (person) => {
    const { sex = person.sex, living = person.living, mainName = person.mainName } = patch;
    return mainName !== null && person.names.every((name) => name.id !== mainName)
      ? missing(mainName)
      : { ok: true, value: { sex, living, mainName } };
  });
}

/** Adds a name or replaces the one with its identifier. The first name is the one shown. */
export function putName(g: FamilyGraph, id: PersonId, name: NameForm): Result<Change, Missing> {
  return editing(g, id, ({ names, mainName }) => {
    const isThere = names.some((one) => one.id === name.id);
    const all = isThere ? names.map((one) => (one.id === name.id ? name : one)) : [...names, name];
    return { ok: true, value: { names: all, mainName: mainName ?? all[0]?.id ?? null } };
  });
}

/** Removes a name. If it was the one shown, the first of the others is. */
export function removeName(g: FamilyGraph, id: PersonId, name: string): Result<Change, Missing> {
  return editing(g, id, ({ names, mainName }) => {
    const others = names.filter((one) => one.id !== name);
    if (others.length === names.length) return missing(name);
    const shown = mainName === name ? (others[0]?.id ?? null) : mainName;
    return { ok: true, value: { names: others, mainName: shown } };
  });
}

export function orderChildren(
  g: FamilyGraph,
  id: PersonId,
  order: PersonId[],
): Result<Change, Missing | Duplicate | NotAChild> {
  return editing<Duplicate | NotAChild>(g, id, ({ children }) => {
    const stranger = order.find((child) => !children.includes(child));
    if (stranger !== undefined) {
      return { ok: false, error: { code: "not-a-child", id: stranger } };
    }
    if (new Set(order).size < order.length) return duplicate;
    return { ok: true, value: { childOrder: order } };
  });
}

/** Everybody a link ties to a person: parents, partners, children. */
export function relativesOf(g: FamilyGraph, id: PersonId): PersonId[] {
  const person = g.person(id);
  if (person === null) return [];
  const parents = person.parents.map(({ parent }) => parent);
  const partners = person.unions.flatMap((union) => g.union(union)?.partners ?? []);
  const found = new Set([...parents, ...partners, ...person.children]);
  return [...found].filter((one): one is PersonId => one !== "unknown" && one !== id);
}

const msInDay = 86_400_000;
/** The day number of 1 January 1970, by the count of `sortKey`. */
const epoch = 2_440_588;
const longLife = 110 * 365.2425;

/**
 * Whether somebody nobody calls living or dead was born over 110 years ago. `birth` is the sort key
 * of the birth, so give none for one only known to be after a date. `now` is in milliseconds. It is
 * shown and never stored.
 */
export function probablyDead({ living }: Person, birth: number | null, now: number): boolean {
  if (living !== "unknown" || birth === null) return false;
  return Math.floor(now / msInDay) + epoch - birth > longLife;
}

function editing<E extends { code: string } = Missing>(
  g: FamilyGraph,
  id: PersonId,
  edit: (person: Person) => Result<Partial<Person>, E | Missing>,
): Result<Change, E | Missing> {
  const person = g.person(id);
  if (person === null) return missing(id);
  const edited = edit(person);
  if (!edited.ok) return edited;
  const draft = new Draft(g);
  draft.putPerson({ ...person, ...edited.value });
  return { ok: true, value: draft.change() };
}
