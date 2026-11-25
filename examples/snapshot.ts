import type { TreeNameForm, TreePerson, TreeSnapshot, TreeYear } from "../src/shared/tree.ts";
import type { ExampleFamily, FuzzyDate, NameForm, PartialDate } from "./family.ts";

/** The invented family as the browser will get a real one. */
export function snapshotOf(family: ExampleFamily): TreeSnapshot {
  const parents = new Map<string, TreePerson["parents"]>();
  for (const { child, ...parentage } of family.parentages) {
    parents.set(child, [...(parents.get(child) ?? []), parentage]);
  }
  const dates = new Map<string, TreeYear | null>();
  const places = new Map<string, string>();
  for (const kind of ["birth", "death"] as const) {
    for (const { kind: found, main, date, place, participants } of family.events) {
      const person = participants[0]?.person;
      if (found !== kind || !main || person === undefined) continue;
      dates.set(`${kind} ${person}`, date === null ? null : yearOf(date));
      if (place !== null && !places.has(person)) places.set(person, place);
    }
  }
  const began = new Map<string, number | null>();
  for (const { kind, union, date } of family.events) {
    if (kind === "wedding" && union !== null && date !== null) began.set(union, yearOf(date).sort);
  }
  return {
    format: 1,
    version: 1,
    people: family.people.map(({ id, sex, living, branch, names: [name, ...others] }) => ({
      id,
      sex,
      living,
      name: name === undefined ? null : formOf(name),
      otherNames: others.map(formOf),
      branch,
      parents: parents.get(id) ?? [],
      birth: dates.get(`birth ${id}`) ?? null,
      death: dates.get(`death ${id}`) ?? null,
      place: places.get(id) ?? null,
    })),
    unions: family.unions.map(({ id, kind, partners: [first, second], certainty }) => ({
      id,
      kind,
      partners: [first, second],
      began: began.get(id) ?? null,
      certainty,
    })),
    branches: family.branches.map(({ id, name, color }) => ({
      id,
      title: { ...name },
      color: color - 1,
    })),
    places: family.places.map(({ id, names }) => ({
      id,
      names: names.map(({ text, language }) => ({ text, language })),
    })),
  };
}

function formOf(form: NameForm): TreeNameForm {
  const { kind, language, script, given, patronymic, surname, certainty } = form;
  return { kind, language, script, given, patronymic, surname, certainty };
}

export function yearOf({ text, parsed }: FuzzyDate): TreeYear {
  if (parsed === null) return { text, qualifier: "unread", sort: null };
  const { qualifier, calendar, from, to } = parsed;
  return {
    text: to === null ? String(from.year) : `${from.year}–${to.year}`,
    qualifier,
    sort: dayNumber(from, calendar),
  };
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
