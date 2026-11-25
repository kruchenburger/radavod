import type {
  Certainty,
  TreeParentage,
  TreePerson,
  TreeSnapshot,
  TreeUnion,
} from "../../../src/shared/tree";

/** Parents who share one line down to a child: one, or two of the same kind. */
export type ParentSet = {
  child: string;
  known: string[];
  /** Parentages to a parent nobody knows. */
  unknown: string[];
  /** Both of the above, in the order of the snapshot. */
  members: { parent: string | null; parentage: string }[];
  kind: TreeParentage["kind"];
  main: boolean;
  /** Of the parentage that is least sure. */
  certainty: Certainty;
};

export type Child = { child: string; set: ParentSet };
export type UnionOf = { union: TreeUnion; other: string | null };

/** The snapshot by questions. It judges nothing: what the snapshot says is drawn. */
export type Kin = {
  /** Everybody once, in the order of the snapshot. */
  ids: string[];
  person: (id: string) => TreePerson | undefined;
  /** The place in the snapshot. */
  index: (id: string) => number;
  /** The set that decides where the person stands comes first. */
  sets: (child: string) => ParentSet[];
  /** In the order of birth. */
  children: (parent: string) => Child[];
  unions: (person: string) => UnionOf[];
  /** Every couple of two known people once. */
  couples: { union: TreeUnion; a: string; b: string }[];
  byBirth: (a: string, b: string) => number;
  /** The person and the ancestors by main blood parents. */
  lineOf: (person: string | null) => Set<string>;
};

const kindOrder: TreeParentage["kind"][] = ["blood", "adoption", "unknown", "guardianship"];
const leastSureFirst: Certainty[] = [
  "contradiction",
  "unresolved",
  "hypothesis",
  "one-source",
  "confirmed",
];

const made = new WeakMap<TreeSnapshot, Kin>();

export function kinOf(snapshot: TreeSnapshot): Kin {
  let kin = made.get(snapshot);
  if (kin === undefined) made.set(snapshot, (kin = read(snapshot)));
  return kin;
}

function read({ people, unions }: TreeSnapshot): Kin {
  const byId = new Map<string, TreePerson>();
  const indexes = new Map<string, number>();
  for (const person of people) {
    if (byId.has(person.id)) continue;
    indexes.set(person.id, byId.size);
    byId.set(person.id, person);
  }
  const ids = [...byId.keys()];
  const index = (id: string): number => indexes.get(id) ?? -1;

  const couples: Kin["couples"] = [];
  const unionsOf = new Map<string, UnionOf[]>();
  for (const union of unions) {
    const [a, b] = union.partners;
    if (!byId.has(a) || a === b || (b !== null && !byId.has(b))) continue;
    const own = listOf(unionsOf, a);
    if (b === null) {
      own.push({ union, other: null });
      continue;
    }
    if (own.some(({ other }) => other === b)) continue;
    own.push({ union, other: b });
    listOf(unionsOf, b).push({ union, other: a });
    couples.push({ union, a, b });
  }
  const areCouple = (a: string, b: string): boolean =>
    unionsOf.get(a)?.some(({ other }) => other === b) === true;

  const setsOf = new Map<string, ParentSet[]>();
  const childrenOf = new Map<string, Child[]>();
  for (const { id, parents } of byId.values()) {
    if (parents.length === 0) continue;
    const sets = groupParents(
      id,
      parents.filter(({ parent }) => parent === null || (parent !== id && byId.has(parent))),
      areCouple,
    );
    setsOf.set(id, sets);
    for (const set of sets) {
      for (const parent of set.known) listOf(childrenOf, parent).push({ child: id, set });
    }
  }

  const bornAt = (id: string): number => byId.get(id)?.birth?.sort ?? Infinity;
  const byBirth = (a: string, b: string): number => {
    const [first, second] = [bornAt(a), bornAt(b)];
    return first === second ? index(a) - index(b) : first - second;
  };
  for (const children of childrenOf.values()) children.sort((a, b) => byBirth(a.child, b.child));

  const none: never[] = [];
  return {
    ids,
    couples,
    index,
    byBirth,
    person: (id) => byId.get(id),
    sets: (child) => setsOf.get(child) ?? none,
    children: (parent) => childrenOf.get(parent) ?? none,
    unions: (person) => unionsOf.get(person) ?? none,
    lineOf: (person) => {
      const line = new Set<string>();
      const queue = person !== null && byId.has(person) ? [person] : [];
      for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
        if (line.has(next)) continue;
        line.add(next);
        for (const set of setsOf.get(next) ?? none) if (isOfLine(set)) queue.push(...set.known);
      }
      return line;
    },
  };
}

export const isOfLine = ({ main, kind }: Pick<ParentSet, "main" | "kind">): boolean =>
  main && kind === "blood";

function groupParents(
  child: string,
  parentages: TreeParentage[],
  areCouple: (a: string, b: string) => boolean,
): ParentSet[] {
  const rank = ({ main, kind }: TreeParentage): number =>
    (main ? 0 : kindOrder.length) + kindOrder.indexOf(kind);
  const groups = new Map<number, TreeParentage[]>();
  const taken = new Set<string>();
  for (const parentage of [...parentages].sort((a, b) => rank(a) - rank(b))) {
    const { parent } = parentage;
    if (parent !== null && taken.has(parent)) continue;
    if (parent !== null) taken.add(parent);
    listOf(groups, rank(parentage)).push(parentage);
  }
  return [...groups.values()].flatMap((group) => {
    const rest = [...group];
    const sets: ParentSet[] = [];
    for (let first = rest.shift(); first !== undefined; first = rest.shift()) {
      const { parent, main } = first;
      const partner = rest.findIndex(
        (other) => parent !== null && other.parent !== null && areCouple(parent, other.parent),
      );
      // Two main parents belong together even when nobody wrote down a union of theirs.
      const at = partner < 0 && main && group.length === 2 ? 0 : partner;
      const second = at < 0 ? undefined : rest.splice(at, 1)[0];
      sets.push(setOf(child, second === undefined ? [first] : [first, second], first));
    }
    return sets;
  });
}

function setOf(child: string, parentages: TreeParentage[], first: TreeParentage): ParentSet {
  const known: string[] = [];
  const unknown: string[] = [];
  let { certainty } = first;
  for (const parentage of parentages) {
    if (parentage.parent === null) unknown.push(parentage.id);
    else known.push(parentage.parent);
    if (leastSureFirst.indexOf(parentage.certainty) < leastSureFirst.indexOf(certainty)) {
      certainty = parentage.certainty;
    }
  }
  const members = parentages.map(({ parent, id }) => ({ parent, parentage: id }));
  return { child, known, unknown, members, kind: first.kind, main: first.main, certainty };
}

export function listOf<K, V>(map: Map<K, V[]>, key: K): V[] {
  let list = map.get(key);
  if (list === undefined) map.set(key, (list = []));
  return list;
}
