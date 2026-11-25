import type { ExampleFamily, Parentage } from "./family.ts";

/** Questions about a family that its tests ask. */
export type Kin = {
  /** Known main blood parents. */
  parents: (person: string) => string[];
  /** Blood ancestors through main parents. */
  ancestors: (person: string) => Set<string>;
  /** Children by any kind of parentage, versions included. */
  children: (person: string) => string[];
  partners: (person: string) => string[];
  related: (a: string, b: string) => boolean;
};

export function kinOf(family: ExampleFamily): Kin {
  const byChild = new Map<string, Parentage[]>();
  const byParent = new Map<string, Parentage[]>();
  const add = (map: Map<string, Parentage[]>, key: string, link: Parentage): void => {
    map.set(key, [...(map.get(key) ?? []), link]);
  };
  for (const link of family.parentages) {
    add(byChild, link.child, link);
    if (link.parent !== null) add(byParent, link.parent, link);
  }

  const parents = (person: string): string[] =>
    (byChild.get(person) ?? [])
      .filter(({ kind, main }) => kind === "blood" && main)
      .flatMap(({ parent }) => (parent === null ? [] : [parent]));
  const ancestors = (person: string): Set<string> => {
    const found = new Set<string>();
    const queue = parents(person);
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      if (found.has(next)) continue;
      found.add(next);
      queue.push(...parents(next));
    }
    return found;
  };
  return {
    parents,
    ancestors,
    children: (person) => (byParent.get(person) ?? []).map(({ child }) => child),
    partners: (person) =>
      family.unions.flatMap(({ partners: [a, b] }) =>
        a === person ? [b] : b === person ? [a] : [],
      ),
    related: (a, b) => {
      const first = ancestors(a).add(a);
      return [...ancestors(b).add(b)].some((ancestor) => first.has(ancestor));
    },
  };
}
