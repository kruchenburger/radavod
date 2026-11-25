/** What a rule answers. The error is a value with a code in kebab-case, never a text for people. */
export type Result<T, E extends { code: string }> =
  { ok: true; value: T } | { ok: false; error: E };
