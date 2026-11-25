import { differ, isOfLists } from "../../../kernel/change";
import { isId, type MemberId } from "../../../kernel/id";

/** One edit: who, when, by what scenario, and what was before and after. Entries are never removed. */
export type Entry = NewEntry & {
  /** Entries are counted from 1. An aggregate has the number of the entry that changed it last. */
  number: number;
};

export type NewEntry = { at: number; by: MemberId; scenario: string; patches: Patch[] };

/**
 * One thing that changed in an aggregate. The path leads to a field or, in lists of things with
 * identifiers, to a field of one of them: "names/n1/given". An empty path is the whole aggregate,
 * "names/n1" a whole name, and "names/" the order of the names. Values are whole: null stands for an
 * aggregate or a thing that is not there. An aggregate of lists only, as the events of a person, is told
 * thing by thing from the first one to the last.
 */
export type Patch = { aggregate: string; path: string; before: unknown; after: unknown };

/** An aggregate before and after, as the contexts tell it. */
export type Changed = { kind: string; id: string; before: unknown; after: unknown };

export function aggregateOf({ kind, id }: Pick<Changed, "kind" | "id">): string {
  return `${kind}/${id}`;
}

export function patchesOf(changed: Changed): Patch[] {
  const aggregate = aggregateOf(changed);
  const lists = isOfLists(aggregate);
  return wholesOf(changed.before, changed.after, lists).map((patch) => ({ aggregate, ...patch }));
}

/**
 * Under whose identifiers an entry is found: the aggregate itself, and every person who came into what
 * the patches tell or left it. An edit of something a person is in and stays in, as the note of an
 * event, is found by what their own entries are about and whom they name. Of those who went from one
 * branch to another there may be hundreds: they are found under the branches.
 */
export function subjectsOf(changed: Changed, patches: readonly Patch[]): string[] {
  const { kind, id, before, after } = changed;
  if (kind.endsWith("-branch")) {
    return [before, after].filter((branch) => typeof branch === "string");
  }
  return [
    id,
    ...patches.flatMap((patch) => {
      const [were, are] = [new Set(peopleIn(patch.before)), new Set(peopleIn(patch.after))];
      return [...were, ...are].filter((one) => !were.has(one) || !are.has(one));
    }),
  ];
}

function peopleIn(value: unknown): string[] {
  if (typeof value === "string") return isId("person", value) ? [value] : [];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(peopleIn);
}

type Difference = Omit<Patch, "aggregate">;

function wholesOf(before: unknown, after: unknown, lists: boolean): Difference[] {
  if (lists && before === null && isLists(after)) return wholesOf(emptied(after), after, lists);
  if (lists && after === null && isLists(before)) return wholesOf(before, emptied(before), lists);
  if (!isObject(before) || !isObject(after)) return [{ path: "", before, after }];
  return fieldsOf(before, after).flatMap(([path, was, is]) =>
    hasIds(was) && hasIds(is) ? thingsOf(path, was, is) : [{ path, before: was, after: is }],
  );
}

/** Whether there is nothing but lists of things: then nothing there is the same as nothing in them. */
function isLists(value: unknown): value is Record<string, Thing[]> {
  return isObject(value) && Object.values(value).every(hasIds);
}

function emptied(lists: Record<string, Thing[]>): Record<string, Thing[]> {
  return Object.fromEntries(Object.keys(lists).map((list) => [list, []]));
}

/** Lists of things with identifiers, compared thing by thing. */
function thingsOf(list: string, before: Thing[], after: Thing[]): Difference[] {
  const [were, are] = [idsOf(before), idsOf(after)];
  const differences = [...new Set([...were, ...are])].flatMap((id): Difference[] => {
    const was = before.find((one) => one.id === id) ?? null;
    const is = after.find((one) => one.id === id) ?? null;
    if (was === null || is === null) return [{ path: `${list}/${id}`, before: was, after: is }];
    return fieldsOf(was, is).map(([field, old, now]) => ({
      path: `${list}/${id}/${field}`,
      before: old,
      after: now,
    }));
  });
  const stayed = were.filter((id) => are.includes(id));
  const atTheEnd = (ids: string[]) => [...stayed, ...ids.filter((id) => !stayed.includes(id))];
  // What is added at the end, or put back there, finds its place by itself.
  const isInOrder = !differ(were, atTheEnd(were)) && !differ(are, atTheEnd(are));
  return isInOrder ? differences : [...differences, { path: `${list}/`, before: were, after: are }];
}

/** The fields that differ. Every aggregate has all its fields, and so has every thing in one. */
function fieldsOf(before: Fields, after: Fields): [string, unknown, unknown][] {
  return Object.keys(after)
    .filter((key) => differ(before[key], after[key]))
    .map((key) => [key, before[key], after[key]]);
}

type Fields = Record<string, unknown>;
type Thing = Fields & { id: string };

function hasIds(value: unknown): value is Thing[] {
  return Array.isArray(value) && value.every((one) => isObject(one) && typeof one.id === "string");
}

function idsOf(list: Thing[]): string[] {
  return list.map(({ id }) => id);
}

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
