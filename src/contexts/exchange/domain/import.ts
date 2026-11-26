import type { Result } from "../../../kernel/result";

export type TreeNotEmpty = { code: "tree-not-empty" };

/** An import goes only into a tree without people: there is nobody yet to take for somebody else. */
export function intoEmptyTree(hasPeople: boolean): Result<object, TreeNotEmpty> {
  return hasPeople ? { ok: false, error: { code: "tree-not-empty" } } : { ok: true, value: {} };
}
