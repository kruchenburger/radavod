import type { TreeParentage, TreeSnapshot, TreeUnion } from "../../../src/shared/tree";
import { kinOf, type ParentSet, type Sibling } from "./kin";

type Tie = Pick<TreeParentage, "kind" | "main" | "certainty">;

/** The kin of one person for the text list: who they are, not how it is said. */
export type Relatives = {
  /** Null for a parent nobody knows. */
  parents: (Tie & { person: string | null })[];
  /** With the parents both have, so a half-sibling and one by guardianship can be told. */
  siblings: Sibling[];
  unions: {
    /** Null for another parent of the children without a known union. */
    union: string | null;
    partner: string | null;
    kind: TreeUnion["kind"] | null;
    certainty: TreeUnion["certainty"] | null;
    children: (Tie & { person: string })[];
  }[];
  /** Children without another parent to name them with. */
  otherChildren: (Tie & { person: string })[];
};

export function relativesOf(snapshot: TreeSnapshot, person: string): Relatives | null {
  const kin = kinOf(snapshot);
  if (kin.person(person) === undefined) return null;

  const parents = kin
    .sets(person)
    .flatMap(({ members, kind, main }) =>
      members.map(({ parent, certainty }) => ({ person: parent, kind, main, certainty })),
    );
  const unions: Relatives["unions"] = kin.unions(person).flatMap(({ all, other }) =>
    all.map(({ id, kind, certainty }) => ({
      union: id,
      partner: other,
      kind,
      certainty,
      children: [],
    })),
  );
  const otherChildren: Relatives["otherChildren"] = [];
  for (const { child, set } of kin.children(person)) {
    const tie = set.members.find(({ parent }) => parent === person);
    if (tie === undefined) continue;
    const { kind, main, certainty } = tie;
    familyOf(child, set, tie).push({ person: child, kind, main, certainty });
  }
  return { parents, siblings: kin.siblings(person), unions, otherChildren };

  function familyOf(child: string, set: ParentSet, tie: TreeParentage): Relatives["otherChildren"] {
    const other = otherParent(child, set);
    const named = [tie.union, ...set.members.map(({ union }) => union)];
    const isOfStranger = other === null && set.unknown.length > 0;
    const own = unions.filter(({ partner }) => partner === other);
    const union =
      own.find((one) => one.union !== null && named.includes(one.union)) ??
      (other !== null || isOfStranger ? own[0] : undefined);
    if (union !== undefined) return union.children;
    if (other === null) return otherChildren;
    const added = { union: null, partner: other, kind: null, certainty: null, children: [] };
    unions.push(added);
    return added.children;
  }

  /**
   * The second parent of the child: told together with the person, else a partner by whatever
   * kinship, else another main parent. A guardian brings up the child of somebody else, and a
   * rejected version is nobody's second parent.
   */
  function otherParent(child: string, { known, kind }: ParentSet): string | null {
    const together = known.find((id) => id !== person);
    if (together !== undefined) return together;
    const rest = kin
      .sets(child)
      .filter(({ main }) => main)
      .flatMap((set) => set.known.map((id) => ({ id, kind: set.kind })))
      .filter(({ id }) => id !== person);
    const partner = rest.find(({ id }) => unions.some((one) => one.partner === id));
    if (partner !== undefined) return partner.id;
    if (kind === "guardianship") return null;
    return rest.find((one) => one.kind !== "guardianship")?.id ?? null;
  }
}
