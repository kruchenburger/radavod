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
  members: TreeParentage[];
  kind: TreeParentage["kind"];
  main: boolean;
};

export type Child = { child: string; set: ParentSet };
export type UnionOf = {
  union: TreeUnion;
  other: string | null;
  /** All unions of the same two, in the order of time. The first one is `union`. */
  all: TreeUnion[];
};

export type Sibling = {
  person: string;
  /** Parents both have, with the kinds of kinship on either side. */
  shared: { parent: string; own: TreeParentage["kind"]; theirs: TreeParentage["kind"] }[];
};

/** The snapshot by questions. It judges nothing: what the snapshot says is drawn. */
export type Kin = {
  /** Everybody once, in the order of the snapshot. The snapshot must not change after. */
  ids: string[];
  person: (id: string) => TreePerson | undefined;
  /** The place in the snapshot. */
  index: (id: string) => number;
  /** The set that decides where the person stands comes first. */
  sets: (child: string) => ParentSet[];
  /** In the order of birth. */
  children: (parent: string) => Child[];
  /** In the order of time, the unions of the same two as one. */
  unions: (person: string) => UnionOf[];
  /** By age. Versions that are not main make nobody a sibling. */
  siblings: (person: string) => Sibling[];
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

/** Everything about one person, so that a question needs one look into the map. */
type Entry = {
  person: TreePerson;
  index: number;
  bornAt: number;
  sets: ParentSet[];
  children: Child[];
  unions: UnionOf[];
};

const none: never[] = [];

function read({ people, unions }: TreeSnapshot): Kin {
  const entries = new Map<string, Entry>();
  for (const person of people) {
    if (entries.has(person.id)) continue;
    const bornAt = person.birth?.sort ?? Infinity;
    const index = entries.size;
    entries.set(person.id, { person, index, bornAt, sets: none, children: none, unions: none });
  }
  const couples = readUnions(unions, entries);

  // In the order of birth, so that the children of every parent come in it too.
  const born = [...entries.values()].sort((a, b) =>
    a.bornAt === b.bornAt ? 0 : a.bornAt - b.bornAt,
  );
  for (const entry of born) {
    const { id, parents } = entry.person;
    if (parents.length === 0) continue;
    const isThere = ({ parent }: TreeParentage): boolean =>
      parent === null || (parent !== id && entries.has(parent));
    const there = parents.every(isThere) ? parents : parents.filter(isThere);
    entry.sets = groupParents(id, there, (a) => entries.get(a)?.unions ?? none);
    for (const set of entry.sets) {
      const child = { child: id, set };
      for (const id of set.known) {
        const parent = entries.get(id) as Entry;
        if (parent.children === none) parent.children = [child];
        else parent.children.push(child);
      }
    }
  }
  for (const entry of entries.values()) sortUnions(entry, entries);
  const byBirth = (a: string, b: string): number => {
    const [first, second] = [entries.get(a), entries.get(b)];
    if (first === undefined || second === undefined) return 0;
    return first.bornAt === second.bornAt
      ? first.index - second.index
      : first.bornAt - second.bornAt;
  };

  return {
    ids: [...entries.keys()],
    couples: couples.map(({ own, a, b }) => ({ union: own.all[0] as TreeUnion, a, b })),
    byBirth,
    person: (id) => entries.get(id)?.person,
    index: (id) => entries.get(id)?.index ?? -1,
    sets: (child) => entries.get(child)?.sets ?? none,
    children: (parent) => entries.get(parent)?.children ?? none,
    unions: (person) => entries.get(person)?.unions ?? none,
    siblings: (person) => {
      const found = new Map<string, Sibling>();
      for (const own of entries.get(person)?.sets ?? none) {
        if (!own.main) continue;
        for (const parent of own.known) {
          for (const { child, set } of entries.get(parent)?.children ?? none) {
            if (child === person || !set.main) continue;
            const sibling = found.get(child) ?? { person: child, shared: [] };
            sibling.shared.push({ parent, own: own.kind, theirs: set.kind });
            found.set(child, sibling);
          }
        }
      }
      return [...found.values()].sort((a, b) => byBirth(a.person, b.person));
    },
    lineOf: (person) => {
      const line = new Set<string>();
      const queue = person !== null && entries.has(person) ? [person] : [];
      for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
        if (line.has(next)) continue;
        line.add(next);
        for (const set of entries.get(next)?.sets ?? none) {
          if (isOfLine(set)) queue.push(...set.known);
        }
      }
      return line;
    },
  };
}

/** Every couple once; a union with somebody who is not there is left out. */
function readUnions(
  unions: TreeUnion[],
  entries: Map<string, Entry>,
): { own: UnionOf; a: string; b: string }[] {
  const couples: { own: UnionOf; a: string; b: string }[] = [];
  const add = (entry: Entry, union: UnionOf): UnionOf => {
    if (entry.unions === none) entry.unions = [];
    entry.unions.push(union);
    return union;
  };
  for (const union of unions) {
    const [a, b] = union.partners;
    const first = entries.get(a);
    if (first === undefined || a === b) continue;
    if (b === null) {
      add(first, { union, other: null, all: [union] });
      continue;
    }
    const second = entries.get(b);
    if (second === undefined) continue;
    const known = first.unions.find(({ other }) => other === b);
    if (known !== undefined) {
      known.all.push(union);
      continue;
    }
    // Both partners share the list, so a later union of the two is seen from either side.
    const all = [union];
    const own = add(first, { union, other: b, all });
    add(second, { union, other: a, all });
    couples.push({ own, a, b });
  }
  return couples;
}

/** In the order of time. An undated union began before its first child was born. */
function sortUnions({ unions, children }: Entry, entries: Map<string, Entry>): void {
  if (unions.length < 2 && (unions[0]?.all.length ?? 0) < 2) return;
  const times = new Map<TreeUnion, number>();
  for (const { other, all } of unions) {
    for (const union of all) {
      const first = children.find(({ set }) => isChildOf(set, union, other, all));
      const bornAt = entries.get(first?.child ?? "")?.bornAt ?? Infinity;
      times.set(union, union.began ?? bornAt);
    }
  }
  const byTime = (a: TreeUnion, b: TreeUnion): number => {
    const [first, second] = [times.get(a) ?? Infinity, times.get(b) ?? Infinity];
    return first === second ? 0 : first - second;
  };
  for (const own of unions) {
    own.all.sort(byTime);
    own.union = own.all[0] as TreeUnion;
  }
  unions.sort((a, b) => byTime(a.union, b.union));
}

/** Born into this union of the two: by name, or into the first told when no name says otherwise. */
function isChildOf(
  { known, members }: ParentSet,
  union: TreeUnion,
  other: string | null,
  all: TreeUnion[],
): boolean {
  if (other !== null && !known.includes(other)) return false;
  const named = all.find(({ id }) => members.some((member) => member.union === id));
  return other === null
    ? named === union
    : named === union || (named === undefined && all[0] === union);
}

export const isOfLine = ({ main, kind }: Pick<ParentSet, "main" | "kind">): boolean =>
  main && kind === "blood";

function groupParents(
  child: string,
  parentages: TreeParentage[],
  unionsOf: (parent: string) => UnionOf[],
): ParentSet[] {
  const [first, second] = parentages;
  if (first === undefined) return [];
  // Most people have a father and a mother and nothing more to tell.
  const isPlain =
    parentages.length === 1 ||
    (parentages.length === 2 &&
      first.main &&
      second?.main === true &&
      first.kind === second.kind &&
      (first.parent !== second.parent || first.parent === null));
  if (isPlain) return [setOf(child, parentages)];

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
      const { parent, main, union } = first;
      const areCouple = (other: TreeParentage, name?: string): boolean =>
        parent !== null &&
        other.parent !== null &&
        unionsOf(parent).some(
          (own) =>
            own.other === other.parent &&
            (name === undefined || (other.union === name && own.all.some(({ id }) => id === name))),
        );
      const named = union === null ? -1 : rest.findIndex((other) => areCouple(other, union));
      const partner = named < 0 ? rest.findIndex((other) => areCouple(other)) : named;
      // Two main parents belong together even when nobody wrote down a union of theirs.
      const at = partner < 0 && main && group.length === 2 ? 0 : partner;
      const second = at < 0 ? undefined : rest.splice(at, 1)[0];
      sets.push(setOf(child, second === undefined ? [first] : [first, second]));
    }
    return sets;
  });
}

function setOf(child: string, parentages: TreeParentage[]): ParentSet {
  const { kind, main } = parentages[0] as TreeParentage;
  const known: string[] = [];
  const unknown: string[] = [];
  for (const { parent, id } of parentages) {
    if (parent === null) unknown.push(id);
    else known.push(parent);
  }
  return { child, known, unknown, members: parentages, kind, main };
}

/** The certainty of the least sure. */
export function leastSure(certainties: Certainty[]): Certainty {
  const least = Math.min(...certainties.map((one) => leastSureFirst.indexOf(one)));
  return leastSureFirst[least] ?? "hypothesis";
}

export function listOf<K, V>(map: Map<K, V[]>, key: K): V[] {
  let list = map.get(key);
  if (list === undefined) map.set(key, (list = []));
  return list;
}
