import type { TreeSnapshot } from "../../../src/shared/tree";

type Far = { up?: number; down?: number; siblings?: boolean; open?: string | null };

/** Who must stand around a person, told apart from the layout: plain searches over the snapshot. */
export function expectedAround(
  { people, unions }: TreeSnapshot,
  focus: string,
  { up = 3, down = 3, siblings = false, open = null }: Far = {},
): Set<string> {
  const byId = new Map<string, TreeSnapshot["people"][number]>();
  for (const person of people) if (!byId.has(person.id)) byId.set(person.id, person);
  if (!byId.has(focus)) return new Set();

  const linksOf = (child: string) =>
    (byId.get(child)?.parents ?? []).filter(
      ({ parent }) => parent === null || (parent !== child && byId.has(parent)),
    );
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string): void => {
    map.set(key, [...(map.get(key) ?? []), value]);
  };
  for (const child of byId.keys()) {
    for (const { parent } of linksOf(child)) {
      if (parent === null) continue;
      add(parents, child, parent);
      add(children, parent, child);
    }
  }
  const reach = (
    map: Map<string, string[]>,
    far: number,
    isFolded: (id: string) => boolean = () => false,
  ): Set<string> => {
    const found = new Set<string>();
    let front = [focus];
    const seen = new Set(front);
    for (let depth = 0; depth < far; depth += 1) {
      front = [...new Set(front.flatMap((id) => map.get(id) ?? []))].filter((id) => !seen.has(id));
      for (const id of front) {
        seen.add(id);
        found.add(id);
      }
      front = front.filter((id) => !isFolded(id));
    }
    return found;
  };
  const wed = (id: string): string[] =>
    unions.flatMap(({ partners: [a, b] }) => {
      if (b === null || a === b || !byId.has(a) || !byId.has(b)) return [];
      if (a === id) return [b];
      return b === id ? [a] : [];
    });
  // Two main parents of one kind are the parents of a child even when no union is known. One
  // parent told in several ways counts by the surest way: main first, then by kind.
  const rank = { blood: 0, adoption: 1, unknown: 2, guardianship: 3 };
  const setOf = (child: string, id: string): (string | null)[] => {
    const links = linksOf(child)
      .map((link, i) => ({ ...link, i }))
      .sort((a, b) => Number(b.main) - Number(a.main) || rank[a.kind] - rank[b.kind] || a.i - b.i);
    const once = links.filter(
      ({ parent }, i) => parent === null || links.findIndex((l) => l.parent === parent) === i,
    );
    const own = once.find(({ parent }) => parent === id);
    const same = once.filter(({ kind, main }) => kind === own?.kind && main === own.main);
    const others = same.flatMap(({ parent }) => (parent === id ? [] : [parent]));
    if (own?.main === true && same.length === 2) return others;
    return others.filter((other) => other !== null && wed(id).includes(other)).slice(0, 1);
  };
  const partners = (id: string): string[] => [
    ...wed(id),
    ...(children.get(id) ?? []).flatMap((child) =>
      setOf(child, id).filter((other) => other !== null),
    ),
  ];

  // Of three unions and more one is open, and the children of the others stand without their own.
  const strangers = unions.filter(({ partners: [a, b] }) => a === focus && b === null);
  const stripKeys = [...new Set(partners(focus))].map((id) => `p:${id}`);
  const isManyUnions = stripKeys.length + strangers.length > 2;
  const folded = new Set<string>();
  for (const child of isManyUnions ? (children.get(focus) ?? []) : []) {
    const [other] = setOf(child, focus);
    const stranger = strangers[0] === undefined ? [] : [`?:partner ${strangers[0].id}`];
    const keys = other === undefined ? [] : other === null ? stranger : [`p:${other}`];
    if (keys.some((key) => key !== open)) folded.add(child);
  }

  const all = new Set([focus, ...partners(focus), ...reach(parents, up)]);
  if (siblings && up > 0) {
    for (const parent of parents.get(focus) ?? []) {
      for (const id of children.get(parent) ?? []) all.add(id);
    }
  }
  for (const id of reach(children, down, (child) => folded.has(child))) {
    all.add(id);
    if (!folded.has(id)) for (const partner of partners(id)) all.add(partner);
  }
  return all;
}
