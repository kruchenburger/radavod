import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf as toSnapshot } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import { around } from "../../../web/tree/layout/around";
import { measure, wordingOf } from "./family";

const made = new Map<number, TreeSnapshot>();

export function bigSnapshot(size: number): TreeSnapshot {
  let snapshot = made.get(size);
  if (snapshot === undefined) made.set(size, (snapshot = toSnapshot(generateFamily(1, size))));
  return snapshot;
}

/** The person with the largest picture around. Nothing the layout keeps is left behind. */
export function busiest(size: number): string {
  const copy = { ...bigSnapshot(size) };
  const options = { measure, wording: wordingOf(copy) };
  let [best, most] = ["", 0];
  for (const { id } of copy.people) {
    const { length } = around(copy, id, options).cards;
    if (length > most) [best, most] = [id, length];
  }
  return best;
}
