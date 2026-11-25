import type { TreeParentage, TreeSnapshot } from "../../../src/shared/tree";
import type { BranchMap } from "./branch-map";
import { kinOf, type ParentSet } from "./kin";
import { mapTracks } from "./stability";

type Tie = Pick<TreeParentage, "kind" | "main" | "certainty">;

/** The kin of one person for the text list: who they are, not how it is said. */
export type Relatives = {
  /** Null for a parent nobody knows. */
  parents: (Tie & { person: string | null })[];
  /** With the parents both have, so half-siblings can be told. */
  siblings: { person: string; shared: string[] }[];
  unions: {
    /** Null for another parent of the children without a known union. */
    union: string | null;
    partner: string | null;
    children: (Tie & { person: string })[];
  }[];
  /** Children without another known parent. */
  otherChildren: (Tie & { person: string })[];
};

export function relativesOf(snapshot: TreeSnapshot, person: string): Relatives | null {
  const kin = kinOf(snapshot);
  if (kin.person(person) === undefined) return null;

  const parents = kin.sets(person).flatMap(({ members, kind, main }) =>
    members.map(({ parent, parentage }) => {
      const told = kin.person(person)?.parents.find(
        (one) => one.parent === parent && one.id === parentage,
      );
      return { person: parent, kind, main, certainty: told?.certainty ?? "hypothesis" };
    }),
  );

  const shared = new Map<string, string[]>();
  for (const { known } of kin.sets(person)) {
    for (const parent of known) {
      for (const { child } of kin.children(parent)) {
        if (child !== person) shared.set(child, [...(shared.get(child) ?? []), parent]);
      }
    }
  }
  const siblings = [...shared.keys()]
    .sort(kin.byBirth)
    .map((sibling) => ({ person: sibling, shared: shared.get(sibling) ?? [] }));

  const unions: Relatives["unions"] = kin
    .unions(person)
    .map(({ union, other }) => ({ union: union.id, partner: other, children: [] }));
  const otherChildren: Relatives["otherChildren"] = [];
  for (const { child, set } of kin.children(person)) {
    familyOf(set).push({
      person: child,
      kind: set.kind,
      main: set.main,
      certainty: set.certainty,
    });
  }
  return { parents, siblings, unions, otherChildren };

  function familyOf({ known, unknown }: ParentSet): Relatives["otherChildren"] {
    const other = known.find((id) => id !== person) ?? null;
    if (other === null && unknown.length === 0) return otherChildren;
    let union = unions.find(({ partner }) => partner === other);
    if (union === undefined) {
      if (other === null) return otherChildren;
      unions.push((union = { union: null, partner: other, children: [] }));
    }
    return union.children;
  }
}

/** Everybody once, page by page and generation by generation, in the order they stand. */
export function peopleByPage(
  map: BranchMap,
): { branch: string | null; people: number; generations: string[][] }[] {
  const pageOf = new Map(map.cards.map(({ person, page, row }) => [person, { page, row }]));
  const generations = map.pages.map((): string[][] => []);
  for (const track of mapTracks(map)) {
    const place = pageOf.get(track[0] ?? null);
    const page = place === undefined ? undefined : generations[place.page];
    if (page !== undefined && place !== undefined) page[place.row] = track;
  }
  return map.pages.map(({ branch, people }, i) => ({
    branch,
    people,
    generations: (generations[i] ?? []).filter((row) => row.length > 0),
  }));
}
