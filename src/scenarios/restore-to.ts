import { differ } from "../kernel/change";
import { type Missing, missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import { takeBack, withoutErased } from "../shared/reverse";
import { putBack, type PutBackError } from "./put-back";
import type { Contexts } from "./unit-of-work";

export type RestoreToError = PutBackError | Missing | { code: "nothing-to-restore" };

/**
 * Makes the tree what it was after an entry, 0 for before the first one. It is an entry like any other:
 * nothing is lost, and it can be undone. Only what differs is written.
 */
export function restoreTo(c: Contexts, number: number): Result<object, RestoreToError> {
  const last = c.history.last();
  if (!Number.isInteger(number) || number < 0 || number > last) return missing(String(number));
  const values = new Map<string, unknown>();
  for (let later = last; later > number; later--) {
    for (const patch of c.history.entry(later)?.patches ?? []) {
      const { aggregate } = patch;
      const value = values.has(aggregate) ? values.get(aggregate) : c.history.authored(aggregate);
      values.set(aggregate, takeBack(value, patch));
    }
  }
  const targets = [...values]
    .map(([aggregate, value]) => ({ aggregate, value: withoutErased(aggregate, value) }))
    .filter(({ aggregate, value }) => differ(c.history.authored(aggregate), value));
  if (targets.length === 0) return { ok: false, error: { code: "nothing-to-restore" } };
  return putBack(c, targets);
}
