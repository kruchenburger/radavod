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
  /** Of the parentage that is least sure. */
  certainty: Certainty;
};

export type Child = { child: string; set: ParentSet };
export type UnionOf = { union: TreeUnion; other: string | null };

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
  /** In the order of time. */
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
    entry.sets = groupParents(id, there, (a, b) => isCouple(entries.get(a), b));
    for (const set of entry.sets) {
      const child = { child: id, set };
      for (const id of set.known) {
        const parent = entries.get(id) as Entry;
        if (parent.children === none) parent.children = [child];
        else parent.children.push(child);
      }
    }
  }
  for (const entry of entries.values()) if (entry.unions.length > 1) sortUnions(entry, entries);

  return {
    ids: [...entries.keys()],
    couples,
    person: (id) => entries.get(id)?.person,
    index: (id) => entries.get(id)?.index ?? -1,
    byBirth: (a, b) => {
      const [first, second] = [entries.get(a), entries.get(b)];
      if (first === undefined || second === undefined) return 0;
      return first.bornAt === second.bornAt
        ? first.index - second.index
        : first.bornAt - second.bornAt;
    },
    sets: (child) => entries.get(child)?.sets ?? none,
    children: (parent) => entries.get(parent)?.children ?? none,
    unions: (person) => entries.get(person)?.unions ?? none,
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

const isCouple = (entry: Entry | undefined, partner: string): boolean =>
  entry?.unions.some(({ other }) => other === partner) === true;

/** Every couple once; a union with somebody who is not there is left out. */
function readUnions(unions: TreeUnion[], entries: Map<string, Entry>): Kin["couples"] {
  const couples: Kin["couples"] = [];
  const add = (entry: Entry, union: UnionOf): void => {
    if (entry.unions === none) entry.unions = [];
    entry.unions.push(union);
  };
  for (const union of unions) {
    const [a, b] = union.partners;
    const first = entries.get(a);
    if (first === undefined || a === b) continue;
    if (b === null) {
      add(first, { union, other: null });
      continue;
    }
    const second = entries.get(b);
    if (second === undefined || isCouple(first, b)) continue;
    add(first, { union, other: b });
    add(second, { union, other: a });
    couples.push({ union, a, b });
  }
  return couples;
}

/** In the order of time. An undated union began before its first child was born. */
function sortUnions({ unions, children }: Entry, entries: Map<string, Entry>): void {
  const beganAt = ({ union, other }: UnionOf): number => {
    if (union.began !== null) return union.began;
    const first = children.find(({ set }) => other !== null && set.known.includes(other));
    return entries.get(first?.child ?? "")?.bornAt ?? Infinity;
  };
  const times = new Map(unions.map((union) => [union, beganAt(union)]));
  unions.sort((a, b) => {
    const [first, second] = [times.get(a) ?? Infinity, times.get(b) ?? Infinity];
    return first === second ? 0 : first - second;
  });
}

export const isOfLine = ({ main, kind }: Pick<ParentSet, "main" | "kind">): boolean =>
  main && kind === "blood";

function groupParents(
  child: string,
  parentages: TreeParentage[],
  areCouple: (a: string, b: string) => boolean,
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
      const { parent, main } = first;
      const partner = rest.findIndex(
        (other) => parent !== null && other.parent !== null && areCouple(parent, other.parent),
      );
      // Two main parents belong together even when nobody wrote down a union of theirs.
      const at = partner < 0 && main && group.length === 2 ? 0 : partner;
      const second = at < 0 ? undefined : rest.splice(at, 1)[0];
      sets.push(setOf(child, second === undefined ? [first] : [first, second]));
    }
    return sets;
  });
}

function setOf(child: string, parentages: TreeParentage[]): ParentSet {
  const first = parentages[0] as TreeParentage;
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
  return {
    child,
    known,
    unknown,
    members: parentages,
    kind: first.kind,
    main: first.main,
    certainty,
  };
}

export function listOf<K, V>(map: Map<K, V[]>, key: K): V[] {
  let list = map.get(key);
  if (list === undefined) map.set(key, (list = []));
  return list;
}
