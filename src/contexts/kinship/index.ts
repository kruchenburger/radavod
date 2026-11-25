/** People, names, parentage, unions and branches. */
export {
  type Kinship,
  type KinshipCommand,
  type KinshipError,
  kinshipOver,
} from "./application/kinship";
export type { KinshipStore } from "./application/ports";
export type { Assignment, Branch, BranchColor, BranchPatch, NewBranch } from "./domain/branch";
export type { Change, PersonRecord } from "./domain/family-graph";
export { descends, type ParentagePatch } from "./domain/parentage";
export {
  type NewPerson,
  type Parentage,
  type Person,
  type PersonPatch,
  probablyDead,
} from "./domain/person";
export type { NewUnion, Union, UnionPatch } from "./domain/union";
