import type { Change, FamilyGraph } from "../domain/family-graph";

/** Where the family is kept. It reads what was saved before, and counts the versions. */
export interface KinshipStore extends FamilyGraph {
  save(change: Change): void;
  /** Whether anybody is in the tree, with what was saved and not written yet. */
  someone(): boolean;
}
