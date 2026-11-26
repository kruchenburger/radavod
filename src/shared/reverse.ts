/**
 * Past states of the tree by the patches of the journal. Pure, for the server and the browser. A state
 * holds what somebody wrote in each aggregate, without what follows from others.
 */

export type Patch = { aggregate: string; path: string; before: unknown; after: unknown };
/** Aggregates that are there, by "kind/id". */
export type State = { readonly [aggregate: string]: unknown };

import { isOfLists } from "../kernel/change";
import { ERASED, ERASED_IN_WORDS } from "../kernel/id";

export { ERASED, isOfLists };

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
export function takeBack(value: unknown, patch: Omit<Patch, "after">): unknown {
  const { aggregate, path, before } = patch;
  if (path === "") return before;
  if (value === null && !isOfLists(aggregate)) return null;
  const fields = fieldsOf(value) ?? {};
  const [field = "", id, part] = path.split("/");
  if (id === undefined) return { ...fields, [field]: before };
  const lists = { ...fields, [field]: listBack(thingsOf(fields[field]), id, part, before) };
  return isOfLists(aggregate) && hasNothing(lists) ? null : lists;
}

function hasNothing(lists: Fields): boolean {
  return Object.values(lists).every((one) => Array.isArray(one) && one.length === 0);
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
  switch (aggregate.split("/")[0]) {
    case "person":
      return {
        ...fields,
        parents: linksWithoutErased(fields.parents),
        childOrder: withoutMark(fields.childOrder),
      };
    case "union":
      return unionWithoutErased(fields);
    case "life":
      return { ...fields, events: eventsWithoutErased(fields.events) };
    case "trash":
      return trashWithoutErased(fields);
    case "cited":
      return { ...fields, citations: citationsWithoutErased(fields.citations) };
    default:
      return value;
  }
}

/**
 * Links to somebody erased since are to a parent nobody knows. A link named by that parent carries the
 * mark in its name, and is named as a link to nobody known is, by a number when that is taken: the
 * rule of `linkId` in src/scenarios/add-relative.ts, which this module cannot import.
 */
function linksWithoutErased(links: unknown): Thing[] {
  const all = thingsOf(links);
  const isMarked = (id: string) =>
    id === ERASED || id.startsWith(`${ERASED}-`) || id.includes(ERASED_IN_WORDS);
  const taken = new Set(all.map(({ id }) => id).filter((id) => !isMarked(id)));
  return all.map((link) => {
    if (link.parent !== ERASED) return link;
    let { id } = link;
    if (isMarked(id)) {
      id = "unknown";
      for (let n = 2; taken.has(id); n++) id = `unknown-${n}`;
      taken.add(id);
    }
    return { ...link, id, parent: "unknown", union: null };
  });
}

function unionWithoutErased(union: Fields): Fields | null {
  const [first, second] = withoutMark(union.partners).filter((one) => one !== "unknown");
  return first === undefined ? null : { ...union, partners: [first, second ?? "unknown"] };
}

function eventsWithoutErased(events: unknown): Thing[] {
  return thingsOf(events).map((event) => ({
    ...event,
    participants: withoutMark(event.participants, "person"),
  }));
}

/** Links of somebody in the trash to an erased person go: they would come back to nobody. */
function trashWithoutErased(trashed: Fields): Fields {
  const person = fieldsOf(trashed.person) ?? {};
  return {
    ...trashed,
    person: {
      ...person,
      parents: withoutMark(person.parents, "parent"),
      childOrder: withoutMark(person.childOrder),
    },
    children: withoutMark(trashed.children, "child"),
    unions: listOf(trashed.unions)
      .map((one) => fieldsOf(one) ?? {})
      .filter((one) => !listOf(fieldsOf(one.union)?.partners).includes(ERASED))
      .map((one) => ({ ...one, children: withoutMark(one.children, "child") })),
    events: eventsWithoutErased(trashed.events),
    guest: withoutMark(trashed.guest, "home"),
    citations: citationsWithoutErased(trashed.citations),
  };
}

/** Citations of a fact that named somebody erased since: the fact is not there to cite. */
function citationsWithoutErased(citations: unknown): unknown[] {
  return listOf(citations).filter((one) => {
    const fact = fieldsOf(fieldsOf(one)?.fact)?.fact;
    return typeof fact !== "string" || !fact.includes(ERASED_IN_WORDS);
  });
}

/** A list without those who are marked as erased, themselves or by a field. */
function withoutMark(list: unknown, field?: string): unknown[] {
  return listOf(list).filter(
    (one) => (field === undefined ? one : fieldsOf(one)?.[field]) !== ERASED,
  );
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
