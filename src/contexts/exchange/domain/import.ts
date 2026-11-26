import type { Result } from "../../../kernel/result";

export type TreeNotEmpty = { code: "tree-not-empty" } | { code: "trash-not-empty" };

/**
 * An import goes only into a tree with nobody in it, the trash included: there is nobody yet to take
 * for somebody else, and a person in the trash is still a person of the tree.
 */
export function intoEmptyTree(tree: {
  hasPeople: boolean;
  hasTrashed: boolean;
}): Result<object, TreeNotEmpty> {
  if (tree.hasPeople) return { ok: false, error: { code: "tree-not-empty" } };
  if (tree.hasTrashed) return { ok: false, error: { code: "trash-not-empty" } };
  return { ok: true, value: {} };
}
