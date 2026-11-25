import type { FuzzyDate as KernelDate } from "../src/kernel/fuzzy-date.ts";
import type { State } from "../src/shared/reverse.ts";
import { snapshotOf as snapshotOfState, yearOf as yearOfDate } from "../src/shared/snapshot.ts";
import type { TreeSample, TreeSnapshot, TreeYear } from "../src/shared/tree.ts";
import { fullestOfLine } from "./start.ts";
import type { ExampleFamily, FamilyEvent, FuzzyDate, Parentage, PartialDate } from "./family.ts";

/** The identifier the tree knows a record of the family by. */
export type IdOf = (kind: string, id: string) => string;

/** The invented family is no tree that was ever edited. */
export const sampleHead = { version: 0, epoch: "sample" };

/**
 * The invented family as the tree keeps it: what was written in each aggregate, by "kind/id". The
 * snapshot is made of it by the code that makes the snapshot of a real tree.
 */
export function stateOf(family: ExampleFamily, idOf: IdOf = (_kind, id) => id): State {
  const person = (id: string) => idOf("person", id);
  const union = (id: string | null) => (id === null ? null : idOf("union", id));
  const place = (id: string | null) => (id === null ? null : idOf("place", id));
  const parents = parentsOf(family);
  const state: Record<string, unknown> = {};
  for (const { id, sex, living, branch, names } of family.people) {
    state[`person/${person(id)}`] = {
      sex,
      living,
      names: names.map((name) => ({
        ...name,
        given: name.given ?? "",
        patronymic: name.patronymic ?? "",
        surname: name.surname ?? "",
      })),
      mainName: names[0]?.id ?? null,
      parents: (parents.get(id) ?? []).map((link) => ({
        ...link,
        parent: link.parent === null ? "unknown" : person(link.parent),
        union: union(link.union),
      })),
      childOrder: [],
    };
    if (branch !== null) state[`person-branch/${person(id)}`] = idOf("branch", branch);
  }
  for (const { id, kind, partners, certainty } of family.unions) {
    state[`union/${idOf("union", id)}`] = { partners: partners.map(person), kind, certainty };
  }
  for (const { id, name, color } of family.branches) {
    state[`branch/${idOf("branch", id)}`] = {
      title: { ru: name.ru, en: name.en },
      color: color - 1,
    };
  }
  for (const { id, names, affiliations } of family.places) {
    state[`place/${idOf("place", id)}`] = {
      names: names.map(({ text, language, from, to }) => ({
        text,
        language,
        period: periodOf(from, to),
      })),
      affiliations: affiliations.map(({ name, from, to }) => ({
        name: name.ru,
        period: periodOf(from, to),
      })),
      coordinates: null,
    };
  }
  const lives = new Map<string, FamilyEvent[]>();
  for (const event of family.events) {
    const home = event.participants[0]?.person;
    if (home !== undefined) lives.set(home, [...(lives.get(home) ?? []), event]);
  }
  for (const [home, events] of lives) {
    state[`life/${person(home)}`] = {
      events: events.map((event) => ({
        id: idOf("event", event.id),
        kind: event.kind,
        title: "",
        date: event.date && dateOf(event.date),
        place: place(event.place),
        participants: event.participants.map(({ person: who, role }) => ({
          person: person(who),
          role,
        })),
        union: union(event.union),
        main: event.main,
        certainty: event.certainty,
        note: "",
      })),
    };
  }
  return state;
}

/** The invented family as the browser gets a real tree. */
export function snapshotOf(family: ExampleFamily): TreeSnapshot {
  return snapshotOfState(stateOf(family), sampleHead);
}

/**
 * The parents of each child, each with the union of the parent with the other parent of the same
 * kind, when both are known.
 */
export function parentsOf(family: ExampleFamily): Map<string, Link[]> {
  const unionOf = unionsOf(family);
  const parents = new Map<string, Link[]>();
  for (const link of family.parentages) {
    const { child, ...parentage } = link;
    parents.set(child, [...(parents.get(child) ?? []), { ...parentage, union: unionOf(link) }]);
  }
  return parents;
}

type Link = Omit<Parentage, "child"> & { union: string | null };

/** Finds the union of the parent of a child with the other parent of the same kind. */
function unionsOf({ parentages, unions }: ExampleFamily) {
  const groupOf = ({ child, kind, main }: Parentage): string => `${child} ${kind} ${main}`;
  const parents = new Map<string, string[]>();
  for (const link of parentages) {
    if (link.parent === null) continue;
    parents.set(groupOf(link), [...(parents.get(groupOf(link)) ?? []), link.parent]);
  }
  const ids = new Map(unions.map(({ id, partners }) => [[...partners].sort().join(" "), id]));
  return (link: Parentage): string | null =>
    link.parent === null
      ? null
      : (ids.get([...(parents.get(groupOf(link)) ?? [])].sort().join(" ")) ?? null);
}

/**
 * The family with the direct line of one of the couple where all branches meet, and the person of
 * that line to begin with.
 */
export function sampleOf(family: ExampleFamily): TreeSample {
  const last = family.unions.find(({ id }) => id === family.lastCouple);
  if (last === undefined) throw new Error("no last couple");
  const [line] = last.partners;
  return { snapshot: snapshotOf(family), start: fullestOfLine(family, line) ?? line, line };
}

/** A date of the family as the kernel keeps it. */
export function dateOf({ text, parsed }: FuzzyDate): KernelDate {
  if (parsed === null) return { text, parsed: null };
  const { qualifier, calendar, from, to } = parsed;
  return { text, parsed: { qualifier, calendar, from, ...(to === null ? {} : { to }) } };
}

export function yearOf(date: FuzzyDate): TreeYear {
  return yearOfDate(dateOf(date));
}

function periodOf(from: number | null, to: number | null): object {
  const year = (at: number | null) =>
    at === null
      ? null
      : {
          text: String(at),
          parsed: { qualifier: "exact", calendar: "gregorian", from: { year: at } },
        };
  return { from: year(from), to: year(to) };
}

/** The Julian day number of the earliest day a date can mean: one count for both calendars. */
export function dayNumber(
  { year, month = 1, day = 1 }: PartialDate,
  calendar: "julian" | "gregorian",
): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const days = day + Math.floor((153 * (month + 12 * a - 3) + 2) / 5) + 365 * y + Math.floor(y / 4);
  return calendar === "julian"
    ? days - 32083
    : days - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
