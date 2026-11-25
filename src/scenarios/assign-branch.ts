import type { KinshipError } from "../contexts/kinship";
import type { Result } from "../kernel/result";
import type { AssignBranchInput } from "../shared/scenarios";
import type { Contexts } from "./unit-of-work";

/** Gives a person a branch, or none, and to the descendants if asked: kinship says to whom. */
export function assignBranch(c: Contexts, input: AssignBranchInput): Result<object, KinshipError> {
  const done = c.kinship.apply({ do: "assign-branch", ...input });
  return done.ok ? { ok: true, value: {} } : done;
}
