import type { Kin, Sibling } from "./layout/kin";

/**
 * Whether two people are known to share one parent and no more. Both need two parents somebody
 * knows: of a parent nobody knows it cannot be said that it is another one.
 */
export function shareOneParent(
  kin: Kin,
  person: string,
  { person: other, shared }: Sibling,
): boolean {
  return shared.length === 1 && [person, other].every((id) => knownParents(kin, id) > 1);
}

function knownParents(kin: Kin, id: string): number {
  return new Set(
    kin
      .sets(id)
      .filter(({ main }) => main)
      .flatMap(({ known }) => known),
  ).size;
}
