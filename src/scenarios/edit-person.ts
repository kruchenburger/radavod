import type { KinshipError } from "../contexts/kinship";
import type { Result } from "../kernel/result";
import type { EditPersonInput } from "../shared/scenarios";
import type { Contexts } from "./unit-of-work";

/** Changes the sex, whether the person lives, and which name is shown. */
export function editPerson(
  c: Contexts,
  { id, patch }: EditPersonInput,
): Result<object, KinshipError> {
  const done = c.kinship.apply({ do: "edit-person", id, patch });
  return done.ok ? { ok: true, value: {} } : done;
}
