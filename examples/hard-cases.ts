import type { ExampleFamily } from "./family.ts";
import { kinOf } from "./kin.ts";

/**
 * Who or what in a family is each case that is hard to lay out or to store. Found in the data alone;
 * an empty list means the case is missing.
 */
export function hardCases(family: ExampleFamily) {
  const { people, parentages, unions } = family;
  const kin = kinOf(family);
  const branchOf = new Map(people.map(({ id, branch }) => [id, branch]));
  const isParent = new Set(parentages.map(({ parent }) => parent));
  const isChild = new Set(parentages.map(({ child }) => child));
  const inUnion = new Set(unions.flatMap(({ partners }) => partners));
  const last = unions.find(({ id }) => id === family.lastCouple)?.partners ?? [];
  const directLine = new Set(last.flatMap((person) => [person, ...kin.ancestors(person)]));

  const ids = (list: { id: string }[]): string[] => list.map(({ id }) => id);
  const partnerPairs = (person: string): [string, string][] => {
    const partners = [...new Set(kin.partners(person))];
    return partners.flatMap((a, i) => partners.slice(i + 1).map((b): [string, string] => [a, b]));
  };
  const isLineal = ([a, b]: [string, string]): boolean =>
    kin.ancestors(a).has(b) || kin.ancestors(b).has(a);

  const siblings = new Map<string, string[]>();
  for (const { id } of people) {
    const parents = kin.parents(id);
    const key = parents.sort().join(" ");
    if (parents.length === 2) siblings.set(key, [...(siblings.get(key) ?? []), id]);
  }

  return {
    threeUnions: ids(people.filter(({ id }) => kin.partners(id).length >= 3)),
    unknownParent: ids(parentages.filter(({ parent }) => parent === null)),
    /** Away from the direct line, where branches meet anyway. */
    crossBranch: ids(
      unions.filter(({ partners: [a, b] }) => {
        const [first, second] = [branchOf.get(a) ?? null, branchOf.get(b) ?? null];
        const direct = directLine.has(a) && directLine.has(b);
        return first !== null && second !== null && first !== second && !direct;
      }),
    ),
    repeatedAncestor: ids(
      people.filter(({ id }) => {
        const [father, mother] = kin.parents(id);
        return father !== undefined && mother !== undefined && kin.related(father, mother);
      }),
    ),
    adoption: ids(
      people.filter(
        ({ id }) =>
          kin.parents(id).length === 2 &&
          parentages.some(({ child, kind }) => child === id && kind === "adoption"),
      ),
    ),
    relativeOfSpouse: ids(
      people.filter(({ id }) =>
        partnerPairs(id).some((pair) => kin.related(...pair) && !isLineal(pair)),
      ),
    ),
    parentVersions: ids(
      people.filter(({ id }) => {
        const links = parentages.filter(({ child, kind }) => child === id && kind === "blood");
        return links.length > 2 && links.some(({ main }) => !main);
      }),
    ),
    unparsedDate: ids(family.events.filter(({ date }) => date !== null && date.parsed === null)),
    noBranch: ids(people.filter(({ branch }) => branch === null)),
    childlessRow: [...siblings.values()]
      .filter((row) => row.length === 8)
      .filter((row) => row.every((id) => !isParent.has(id) && !inUnion.has(id)))
      .flat(),
    unnamed: ids(people.filter(({ names }) => names.length === 0)),
    noKin: ids(
      people.filter(({ id }) => !isParent.has(id) && !isChild.has(id) && !inUnion.has(id)),
    ),
  };
}
