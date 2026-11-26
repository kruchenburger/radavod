import type { TreeParentage, TreePerson, TreeSnapshot } from "../../../src/shared/tree";
import type { Measure, TextStyle, Wording } from "../../../web/tree/layout/types";

const letter: Partial<Record<TextStyle, number>> = {
  focusName: 17,
  focusNameDouble: 14,
  head: 13,
  nameDirect: 8.5,
  detail: 6.5,
  closerName: 7,
  closerNameDirect: 7.5,
  nearName: 9,
  nearNameDirect: 9.5,
  nearDetail: 6.5,
};

/** Every letter is as wide as any other, so a test needs no fonts. */
export const measure: Measure = (text, style) => [...text].length * (letter[style] ?? 8);

export function wordingOf(snapshot: TreeSnapshot): Wording {
  const branches = new Map(snapshot.branches.map(({ id, title }) => [id, title.ru]));
  return {
    person: (person) => ({
      given: person.name?.given ?? "",
      surname: person.name?.surname ?? "",
      years: [person.birth?.text ?? "", person.death?.text ?? ""].join("–"),
      branch: branches.get(person.branch ?? "") ?? "",
    }),
    apart: (other) => `also ${other.name?.given ?? ""}`,
    unknown: ({ of }) => `unknown ${of}`,
    reference: ({ as, page }) => ({
      title: `see the ${as}`,
      detail: branches.get(page ?? "") ?? "",
    }),
  };
}

type ParentSpec = string | null | Partial<TreeParentage>;

export type PersonSpec = {
  id: string;
  born?: number | undefined;
  branch?: string | null;
  given?: string;
  surname?: string;
  parents?: ParentSpec[];
};

export type FamilySpec = {
  people: (string | PersonSpec)[];
  unions?: [string, string | null][];
  branches?: string[];
};

/** A snapshot from a few words: everything not said gets an ordinary value. */
export function familyOf({ people, unions = [], branches = [] }: FamilySpec): TreeSnapshot {
  return {
    format: 1,
    version: 1,
    epoch: "test",
    people: people.map((spec) => personOf(typeof spec === "string" ? { id: spec } : spec)),
    unions: unions.map((partners, i) => ({
      id: `u${i}`,
      kind: "marriage",
      partners,
      began: null,
      branch: null,
      certainty: "confirmed",
    })),
    branches: branches.map((id, i) => ({ id, title: { ru: id, en: id }, color: i % 12 })),
    places: [],
  };
}

export function personOf(spec: PersonSpec): TreePerson {
  const { id, born, branch = null, given = id, surname = "Example", parents = [] } = spec;
  return {
    id,
    sex: "unknown",
    living: "unknown",
    name: {
      kind: "birth",
      language: "en",
      script: "Latn",
      given,
      patronymic: null,
      surname,
      certainty: "hypothesis",
    },
    otherNames: [],
    branch,
    parents: parents.map((parent, i) => ({
      id: `${id}-${i}`,
      parent: null,
      union: null,
      kind: "blood",
      main: true,
      certainty: "confirmed",
      ...(parent === null || typeof parent === "string" ? { parent } : parent),
    })),
    childOrder: [],
    birth: born === undefined ? null : { text: String(born), qualifier: "exact", sort: born * 365 },
    death: null,
    place: null,
  };
}
