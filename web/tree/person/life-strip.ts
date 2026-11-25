import type { TreePerson, TreeSnapshot, TreeYear } from "../../../src/shared/tree";
import { kinOf } from "../layout/kin";
import { relativesOf } from "../layout/relatives";

/**
 * An end of a bar. Solid up to `inner`, dashes from there to `outer`. A known year has a cap, an
 * end nobody knows a question.
 */
export type End = { inner: number; outer: number; has: "cap" | "question" | null };
export type Life = { person: string; bar: { start: End; end: End } | null };
export type Group = { as: "self" | "parents" | "unions" | "children"; lives: Life[] };

export type LifeStrip = {
  /** The scale, in years. */
  from: number;
  to: number;
  /** Null when today is not on the scale. */
  today: number | null;
  /** The life of the person through all rows. */
  span: { from: number; to: number } | null;
  groups: Group[];
};

/** What docs/design.md draws, in years: the screen turns them into places. */
export function lifeStrip(
  snapshot: TreeSnapshot,
  person: string,
  { today, before }: { today: number; before: number },
): LifeStrip | null {
  const kin = kinOf(snapshot);
  const relatives = relativesOf(snapshot, person);
  if (relatives === null) return null;
  const lifeOf = (id: string): Life => {
    const one = kin.person(id);
    return { person: id, bar: one === undefined ? null : barOf(one, snapshot, today) };
  };
  const once = (ids: (string | null)[]): Life[] =>
    [...new Set(ids)].flatMap((id) => (id === null ? [] : [lifeOf(id)]));
  const { parents, unions, otherChildren } = relatives;
  const children = [...unions.flatMap((union) => union.children), ...otherChildren];
  children.sort((a, b) => kin.byBirth(a.person, b.person));
  const groups: Group[] = (
    [
      { as: "self", lives: [lifeOf(person)] },
      { as: "parents", lives: once(parents.filter(({ main }) => main).map((one) => one.person)) },
      { as: "unions", lives: once(unions.map(({ partner }) => partner)) },
      { as: "children", lives: once(children.map((one) => one.person)) },
    ] satisfies Group[]
  ).filter(({ lives }) => lives.length > 0);

  const bars = groups.flatMap(({ lives }) => lives.flatMap(({ bar }) => bar ?? []));
  if (bars.length === 0) return null;
  const own = groups[0]?.lives[0]?.bar ?? null;
  const first = Math.min(...bars.map(({ start }) => start.outer));
  const last = Math.max(...bars.map(({ end }) => end.outer));
  const from = own === null ? first : Math.max(first, own.start.outer - before);
  const room = Math.max(1, (last - from) * 0.02);
  return {
    from: from - room,
    to: last === today ? today : last + room,
    today: last === today ? today : null,
    span: own === null ? null : { from: own.start.outer, to: own.end.outer },
    groups,
  };
}

/** What a year can mean, or null when it cannot be read. */
function rangeOf(year: TreeYear | null): { from: number; to: number; isExact: boolean } | null {
  if (year === null || year.qualifier === "unread") return null;
  const [from = NaN, to = from] = (year.text.match(/\d{1,4}/g) ?? []).map(Number);
  if (Number.isNaN(from)) return null;
  switch (year.qualifier) {
    case "exact":
      return { from, to: from, isExact: true };
    case "about":
      return { from: from - 1.5, to: from + 1.5, isExact: false };
    case "before":
      return { from: from - 3, to: from, isExact: false };
    case "after":
      return { from, to: from + 3, isExact: false };
    case "between":
      return { from: Math.min(from, to), to: Math.max(from, to), isExact: false };
  }
}

function barOf(person: TreePerson, snapshot: TreeSnapshot, today: number): Life["bar"] {
  const birth = rangeOf(person.birth);
  const death = rangeOf(person.death);
  const known = [birth, death].flatMap((range) => (range === null ? [] : [range.from, range.to]));
  if (known.length === 0) return null;
  known.push(...eventsOf(person, snapshot));

  const start: End =
    birth === null
      ? { inner: Math.min(...known), outer: Math.min(...known), has: "question" }
      : { inner: birth.to, outer: birth.from, has: birth.isExact ? "cap" : null };
  let end: End;
  if (death !== null) {
    end = { inner: death.from, outer: death.to, has: death.isExact ? "cap" : null };
  } else if (person.living === "yes") end = { inner: today, outer: today, has: null };
  else end = { inner: Math.max(...known), outer: Math.max(...known), has: "question" };

  // A strange life is kept, and still drawn from left to right.
  end.outer = Math.max(end.outer, start.outer);
  const [a, b] = [start.inner, end.inner];
  if (a > b) start.inner = end.inner = (Math.max(start.outer, b) + Math.min(end.outer, a)) / 2;
  return { start, end };
}

/** Years of what the snapshot knows of a life: unions that began and children. */
function eventsOf({ id }: TreePerson, snapshot: TreeSnapshot): number[] {
  const kin = kinOf(snapshot);
  const began = kin
    .unions(id)
    .flatMap(({ all }) => all.flatMap((union) => union.began ?? []))
    .map(yearOfDay);
  const children = kin.children(id).flatMap(({ child, set }) => {
    const range =
      set.main && set.kind === "blood" ? rangeOf(kin.person(child)?.birth ?? null) : null;
    return range === null ? [] : [Math.round((range.from + range.to) / 2)];
  });
  return [...began, ...children];
}

/** The Gregorian year of a day number, counted as in the snapshot. */
const yearOfDay = (day: number): number => Math.floor((day - 1721060) / 365.2425);
