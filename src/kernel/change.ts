/** One aggregate before and after. Null stands for one that is not there. */
export type Write<Kind extends string, Id, Value> = {
  kind: Kind;
  id: Id;
  before: Value | null;
  after: Value | null;
};

/** The write of an aggregate, or none when nothing differs. */
export function writes<Kind extends string, Id, Value>(
  kind: Kind,
  id: Id,
  before: Value | null,
  after: Value | null,
): Write<Kind, Id, Value>[] {
  return differ(before, after) ? [{ kind, id, before, after }] : [];
}

/** Aggregates are plain data. The order of its keys says nothing. */
export function differ(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, inOrder) !== JSON.stringify(b, inOrder);
}

function inOrder(_: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)));
}
