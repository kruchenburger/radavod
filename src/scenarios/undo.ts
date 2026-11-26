import { differ } from "../kernel/change";
import { type Missing, missing } from "../kernel/refusal";
import type { Result } from "../kernel/result";
import { ERASED_IN_WORDS, isErasedMark } from "../kernel/id";
import { ERASED, isOfLists, isOrder, type Patch, takeBack, valueAt } from "../shared/reverse";
import { putBack, type PutBackError } from "./put-back";
import type { Contexts } from "./unit-of-work";

export type UndoError =
  | PutBackError
  | Missing
  /** What the entry set is something else now, by a later entry. */
  | { code: "changed-since"; aggregate: string; path: string; by: number }
  /** Somebody in the entry was erased, so it cannot be told any more what there was. */
  | { code: "irreversible" };

/** Takes one entry back, if what it set is still so. What was done elsewhere since stays. */
export function undo(c: Contexts, number: number): Result<object, UndoError> {
  const entry = c.history.entry(number);
  if (entry === null) return missing(String(number));
  // Where somebody was erased, in a field or in words, nobody can tell any more what there was.
  const told = JSON.stringify(entry.patches);
  const isOfErased = ({ path }: Patch) => path.split("/").some(isErasedMark);
  if (
    entry.patches.length === 0 ||
    told.includes(`"${ERASED}"`) ||
    told.includes(`"${ERASED}-`) ||
    told.includes(ERASED_IN_WORDS) ||
    entry.patches.some(isOfErased)
  ) {
    return { ok: false, error: { code: "irreversible" } };
  }
  const values = new Map<string, unknown>();
  for (const patch of entry.patches) {
    const { aggregate, path, after } = patch;
    const current = c.history.authored(aggregate);
    const isGone = current === null && path !== "" && !isOfLists(aggregate);
    if (isGone || (!isOrder(path) && differ(valueAt(current, path), after))) {
      const by = changedBy(c, number, patch);
      if (by === null) return { ok: false, error: { code: "irreversible" } };
      return { ok: false, error: { code: "changed-since", aggregate, path, by } };
    }
    const value = values.has(aggregate) ? values.get(aggregate) : current;
    values.set(aggregate, takeBack(value, patch));
  }
  return putBack(
    c,
    [...values].map(([aggregate, value]) => ({ aggregate, value })),
  );
}

/** The last entry that changed what a patch set. */
function changedBy(
  { history }: Contexts,
  number: number,
  { aggregate, path }: Patch,
): number | null {
  for (let later = history.last(); later > number; later--) {
    const patches = history.entry(later)?.patches ?? [];
    const isIt = patches.some(
      (one) => one.aggregate === aggregate && !isOrder(one.path) && overlap(one.path, path),
    );
    if (isIt) return later;
  }
  return null;
}

/** Whether one path leads to a part of the other, or to the same. */
function overlap(a: string, b: string): boolean {
  return a === "" || b === "" || `${a}/`.startsWith(`${b}/`) || `${b}/`.startsWith(`${a}/`);
}
