import type { TreeNameForm, TreePerson, TreeSnapshot, TreeYear } from "../../src/shared/tree";
import { type Locale, t } from "../i18n/t";
import { kinOf } from "./layout/kin";
import type { Reference, Wording } from "./layout/types";

export type FullName = { given: string; surname: string };

/** What the screens say about a person, in one language. */
export type Words = Wording & {
  /** The same on the map, where a reference names a page. */
  onMap: Wording;
  name: (person: TreePerson) => string;
  isNamed: (person: TreePerson) => boolean;
  /** With the patronymic. */
  fullName: (form: TreeNameForm | null) => FullName;
  years: (person: TreePerson) => string;
  /** The year a life began and the year it ended, each by itself. */
  ends: (person: TreePerson) => [start: string, end: string];
  bornAs: (person: TreePerson) => string | null;
  branch: (branch: string | null) => string;
  /** The title of a page of the map. */
  page: (branch: string | null) => string;
  ink: (branch: string | null) => string;
  place: (place: string | null) => string | null;
};

/** The chosen person has the surname at birth beside the years. */
export function wordsOf(
  snapshot: TreeSnapshot,
  locale: Locale,
  chosen: string | null = null,
): Words {
  const kin = kinOf(snapshot);
  const branches = new Map(snapshot.branches.map((branch) => [branch.id, branch]));
  const places = new Map(snapshot.places.map(({ id, names }) => [id, names]));
  const titleOf = (branch: string | null): string | undefined =>
    branches.get(branch ?? "")?.title[locale];
  const branch = (id: string | null): string => titleOf(id) ?? t(locale, "person.noBranch");
  const page = (id: string | null): string => titleOf(id) ?? t(locale, "map.noBranch");
  const nameOf = (form: TreeNameForm | null, given = form?.given): FullName => {
    const name = { given: given?.trim() ?? "", surname: form?.surname?.trim() ?? "" };
    if (name.given !== "" || name.surname !== "") return name;
    return { given: t(locale, "person.unnamed"), surname: "" };
  };
  const givenOf = (id: string): string => {
    const { given, surname } = nameOf(kin.person(id)?.name ?? null);
    return given === "" ? surname : given;
  };
  const years = (person: TreePerson): string => yearsText(locale, person);
  const bornAs = ({ name, otherNames }: TreePerson): string | null => {
    if (name?.kind !== "married") return null;
    const births = otherNames.filter(({ kind, surname }) => kind === "birth" && surname !== null);
    const surname = (births.find(({ language }) => language === name.language) ?? births[0])
      ?.surname;
    if (surname === undefined || surname === null || surname === name.surname) return null;
    return t(locale, "person.bornAs", { surname });
  };
  const person: Wording["person"] = (one) => {
    const born = one.id === chosen ? bornAs(one) : null;
    return {
      ...nameOf(one.name),
      years: [years(one), ...(born === null ? [] : [born])].join(", "),
      branch: branch(one.branch),
    };
  };
  const unknown: Wording["unknown"] = (place) => {
    if (place.of === "partner") return t(locale, "person.unnamed");
    return t(locale, place.parentages.length > 1 ? "tree.parentsUnknown" : "tree.parentUnknown");
  };
  const onMap: Wording = {
    person,
    unknown,
    reference: ({ as, people, page: at }: Reference) => ({
      title:
        as === "parents"
          ? t(locale, "map.seeParents")
          : t(locale, "map.see", { name: people.map(givenOf).join(", ") }),
      detail: page(at),
    }),
  };
  return {
    onMap,
    person,
    unknown,
    reference: ({ people }) => ({
      title: t(locale, people.length > 1 ? "tree.sameParents" : "tree.sameParent"),
      detail: people.map(givenOf).join(", "),
    }),
    name: (one) => {
      const { given, surname } = nameOf(one.name);
      return `${given} ${surname}`.trim();
    },
    isNamed: ({ name }) => [name?.given, name?.surname].some((part) => part?.trim()),
    fullName: (form) =>
      nameOf(form, [form?.given, form?.patronymic].filter((part) => part?.trim()).join(" ")),
    years,
    ends: ({ birth, death, living }) => endsOf(locale, birth, death, living),
    bornAs,
    branch,
    page,
    ink: (id) => {
      const color = branches.get(id ?? "")?.color;
      return color === undefined ? "var(--no-branch)" : `var(--branch-${color + 1})`;
    },
    place: (id) => {
      const names = places.get(id ?? "") ?? [];
      return (names.find(({ language }) => language === locale) ?? names[0])?.text ?? null;
    },
  };
}

function yearsText(locale: Locale, { birth, death, living }: TreePerson): string {
  if (birth === null && death === null) return t(locale, "person.noYears");
  const [start, end] = endsOf(locale, birth, death, living);
  // A dash between words needs room.
  const isWordy = (death !== null && death.qualifier !== "exact") || hasWordsInside(birth);
  return isWordy ? `${start} – ${end}`.trimEnd() : `${start}–${end}`;
}

function endsOf(
  locale: Locale,
  birth: TreePerson["birth"],
  death: TreePerson["death"],
  living: TreePerson["living"],
): [string, string] {
  return [
    birth === null ? "?" : yearText(locale, birth),
    death === null ? (living === "yes" ? "" : "?") : yearText(locale, death),
  ];
}

const hasWordsInside = (year: TreeYear | null): boolean =>
  year?.qualifier === "between" || year?.qualifier === "unread";

function yearText(locale: Locale, { text, qualifier }: TreeYear): string {
  switch (qualifier) {
    case "exact":
      return text;
    case "about":
      return t(locale, "year.about", { year: text });
    case "before":
      return t(locale, "year.before", { year: text });
    case "after":
      return t(locale, "year.after", { year: text });
    case "unread":
      return t(locale, "year.unread", { text });
    case "between": {
      const [from = text, to = from] = text.split("–");
      return t(locale, "year.between", { from, to });
    }
  }
}
