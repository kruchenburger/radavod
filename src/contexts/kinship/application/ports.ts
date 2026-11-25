import type { Change, FamilyGraph } from "../domain/family-graph";

/** Where the family is kept. It reads what was saved before, and counts the versions. */
export interface KinshipStore extends FamilyGraph {
  save(change: Change): void;
}
