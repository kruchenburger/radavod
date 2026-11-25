import type { Result } from "../kernel/result";
import { putBack } from "./put-back";
import type { RestoreToError } from "./restore-to";
import type { Contexts } from "./unit-of-work";

/** Empties the tree by one entry. The journal stays, so it can be returned to. */
export function startOver(c: Contexts): Result<object, RestoreToError> {
  const aggregates = Object.keys(c.history.state());
  if (aggregates.length === 0) return { ok: false, error: { code: "nothing-to-restore" } };
  return putBack(
    c,
    aggregates.map((aggregate) => ({ aggregate, value: null })),
  );
}
