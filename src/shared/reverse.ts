/**
 * Past states of the tree by the patches of the journal. Pure, for the server and the browser. A state
 * holds what somebody wrote in each aggregate, without what follows from others.
 */

export type Patch = { aggregate: string; path: string; before: unknown; after: unknown };
/** Aggregates that are there, by "kind/id". */
export type State = { readonly [aggregate: string]: unknown };

/** Stands in the journal for a person who was erased. */
export const ERASED = "erased";

/** The state before the entries, which go from the last one back. */
export function reverse(state: State, entries: readonly { patches: readonly Patch[] }[]): State {
  const values = new Map<string, unknown>(Object.entries(state));
  const touched = new Set<string>();
  for (const { patches } of entries) {
    for (const patch of patches) {
      const { aggregate } = patch;
      values.set(aggregate, takeBack(values.get(aggregate) ?? null, patch));
      touched.add(aggregate);
    }
  }
  for (const aggregate of touched) {
    const value = withoutErased(aggregate, values.get(aggregate) ?? null);
    if (value === null) values.delete(aggregate);
    else values.set(aggregate, value);
  }
  return Object.fromEntries(values);
}

/** What stands at a path of an aggregate, null if nothing does. */
export function valueAt(value: unknown, path: string): unknown {
  if (path === "") return value;
  const [field = "", id, part] = path.split("/");
  const found = fieldsOf(value)?.[field];
  if (id === undefined) return found ?? null;
  const thing = thingsOf(found).find((one) => one.id === id) ?? null;
  return part === undefined ? thing : (thing?.[part] ?? null);
}

/** Whether a path is the order of a list. It changes with every other thing in it. */
export function isOrder(path: string): boolean {
  return path.endsWith("/");
}

/** An aggregate without one change. Patches of an entry are taken back in their order. */
export function takeBack(
  value: unknown,
  { path, before }: Pick<Patch, "path" | "before">,
): unknown {
  if (path === "") return before;
  const fields = fieldsOf(value);
  if (fields === null) return value;
  const [field = "", id, part] = path.split("/");
  if (id === undefined) return { ...fields, [field]: before };
  const things = thingsOf(fields[field]);
  return { ...fields, [field]: listBack(things, id, part, before) };
}

function listBack(things: Thing[], id: string, part: string | undefined, before: unknown): Thing[] {
  if (id === "") return inOrder(things, before);
  if (part !== undefined) {
    return things.map((one) => (one.id === id ? { ...one, [part]: before } : one));
  }
  const others = things.filter((one) => one.id !== id);
  return before === null ? others : [...others, before as Thing];
}

/** Things in an order. Whatever came since stays behind them. */
function inOrder(things: Thing[], order: unknown): Thing[] {
  const ids = Array.isArray(order) ? order : [];
  const at = ({ id }: Thing) => (ids.includes(id) ? ids.indexOf(id) : ids.length);
  return things.toSorted((a, b) => at(a) - at(b));
}

/** A value of the past where somebody erased since is nobody known, or is not there at all. */
export function withoutErased(aggregate: string, value: unknown): unknown {
  const fields = fieldsOf(value);
  if (fields === null) return value;
  const isThere = (one: unknown) => one !== ERASED;
  switch (aggregate.split("/")[0]) {
    case "person":
      return {
        ...fields,
        parents: thingsOf(fields.parents).map((link) =>
          link.parent === ERASED ? { ...link, parent: "unknown", union: null } : link,
        ),
        childOrder: listOf(fields.childOrder).filter(isThere),
      };
    case "union": {
      const partners = listOf(fields.partners).filter((one) => isThere(one) && one !== "unknown");
      if (partners.length === 0) return null;
      return { ...fields, partners: [partners[0], partners[1] ?? "unknown"] };
    }
    case "life":
      return {
        ...fields,
        events: thingsOf(fields.events).map((event) => ({
          ...event,
          participants: listOf(event.participants).filter(
            (one) => fieldsOf(one)?.person !== ERASED,
          ),
        })),
      };
    default:
      return value;
  }
}

type Fields = { readonly [field: string]: unknown };
type Thing = Fields & { readonly id: string };

function fieldsOf(value: unknown): Fields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function thingsOf(value: unknown): Thing[] {
  return listOf(value) as Thing[];
}
