import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { snapshotOf } from "../../examples/snapshot.ts";
import type { TreeNameForm, TreePerson } from "../../src/shared/tree";
import { searchOf } from "../../web/tree/search";
import { familyOf, personOf } from "./layout/family";

const form = (
  given: string,
  surname: string,
  change: Partial<TreeNameForm> = {},
): TreeNameForm => ({
  kind: "birth",
  language: "ru",
  script: "Cyrl",
  given,
  patronymic: null,
  surname,
  certainty: "hypothesis",
  ...change,
});
const person = (id: string, name: TreeNameForm | null, change: Partial<TreePerson> = {}) => ({
  ...personOf({ id }),
  name,
  ...change,
});

const snapshot = {
  ...familyOf({ people: [] }),
  people: [
    person("fedor", form("Фёдор", "Рябинник-Туманик", { patronymic: "Осипович" })),
    person("lukasz", form("Лука", "Жук"), {
      otherNames: [form("Łukasz", "Żuk", { language: "pl", script: "Latn" })],
      place: "l1",
    }),
    person("nobody", null),
    person("luka", form("Лука", "Вересень"), { place: "l1" }),
    person("zhukova", form("Ганна", "Жукова")),
  ],
  places: [{ id: "l1", names: [{ text: "Заольховичи", language: "ru" as const }] }],
};
const search = searchOf(snapshot);
const ids = (query: string) => search(query).map((found) => found.person.id);

describe("finds", () => {
  it.each([
    ["федор", ["fedor"]],
    ["ФЁДОР туманик", ["fedor"]],
    ["Туманик Фёдоръ", ["fedor"]],
    ["Осип", ["fedor"]],
    ["lukasz", ["lukasz"]],
    ["żuk łuk", ["lukasz"]],
    ["лука", ["lukasz", "luka"]],
    ["лука вер", ["luka"]],
    ["заоль", ["lukasz", "luka"]],
    ["лука заоль", ["lukasz", "luka"]],
    ["никто", []],
    ["", []],
    ["  ", []],
    ["-", []],
  ])("%j", (query, expected) => {
    expect(ids(query)).toEqual(expected);
  });
});

it("puts a whole word before the beginning of one, and the name before the place", () => {
  expect(ids("жук")).toEqual(["lukasz", "zhukova"]);
});

it("does not mix words of two names of one person", () => {
  expect(ids("лука żuk")).toEqual([]);
});

it("says by which other name somebody was found", () => {
  expect(search("lukasz")[0]?.form?.given).toBe("Łukasz");
  expect(search("лука")[0]?.form).toBeNull();
  expect(search("заоль")[0]?.form).toBeNull();
});

it("finds everybody of the invented family by every name", () => {
  const family = snapshotOf(generateFamily(1, 300));
  const find = searchOf(family);
  for (const { id, name, otherNames } of family.people) {
    for (const one of [name, ...otherNames]) {
      if (one === null) continue;
      const query = [one.given, one.surname].filter(Boolean).join(" ");
      expect(
        find(query).map((found) => found.person.id),
        query,
      ).toContain(id);
    }
  }
});
