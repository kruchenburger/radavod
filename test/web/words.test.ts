import { describe, expect, it } from "vitest";
import type { TreeNameForm, TreePerson, TreeYear } from "../../src/shared/tree";
import { wordsOf } from "../../web/tree/words";
import { familyOf, personOf } from "./layout/family";

const exact = (text: string): TreeYear => ({ text, qualifier: "exact", sort: 1 });
const year = (qualifier: TreeYear["qualifier"], text: string): TreeYear => ({
  text,
  qualifier,
  sort: null,
});

const snapshot = {
  ...familyOf({ people: ["a", "b", "c"], branches: ["b1"] }),
  places: [
    {
      id: "l1",
      names: [
        { text: "Верасень", language: "be" as const },
        { text: "Вересень", language: "ru" as const },
      ],
    },
  ],
};
const ru = wordsOf(snapshot, "ru");
const en = wordsOf(snapshot, "en");

const person = (change: Partial<TreePerson>): TreePerson => ({
  ...personOf({ id: "a" }),
  ...change,
});
const form = (change: Partial<TreeNameForm>): TreeNameForm => ({
  kind: "birth",
  language: "ru",
  script: "Cyrl",
  given: "Ганна",
  patronymic: null,
  surname: "Журавик",
  certainty: "hypothesis",
  ...change,
});

describe("years", () => {
  it.each([
    [exact("1909"), exact("1987"), "no", "1909–1987", "1909–1987"],
    [exact("1961"), null, "yes", "1961–", "1961–"],
    [exact("1760"), null, "no", "1760–?", "1760–?"],
    [exact("1909"), null, "unknown", "1909–?", "1909–?"],
    [null, exact("1833"), "no", "?–1833", "?–1833"],
    [null, null, "no", "годы неизвестны", "years unknown"],
    [null, null, "yes", "годы неизвестны", "years unknown"],
    [year("about", "1906"), exact("1971"), "no", "ок. 1906–1971", "about 1906–1971"],
    [exact("1818"), year("about", "1890"), "no", "1818 – ок. 1890", "1818 – about 1890"],
    [year("after", "1881"), null, "no", "после 1881–?", "after 1881–?"],
    [exact("1790"), year("before", "1860"), "no", "1790 – до 1860", "1790 – before 1860"],
    [
      year("between", "1880–1885"),
      exact("1940"),
      "no",
      "между 1880 и 1885 – 1940",
      "between 1880 and 1885 – 1940",
    ],
    [year("unread", "на Покров"), null, "no", "«на Покров» – ?", "“на Покров” – ?"],
  ] as const)("%j to %j, living %s", (birth, death, living, inRussian, inEnglish) => {
    expect(ru.years(person({ birth, death, living }))).toBe(inRussian);
    expect(en.years(person({ birth, death, living }))).toBe(inEnglish);
  });
});

describe("names", () => {
  it("are the form shown, in any language of the interface", () => {
    const one = person({ name: form({}) });
    expect([ru.name(one), en.name(one)]).toEqual(["Ганна Журавик", "Ганна Журавик"]);
  });

  it("have their patronymic on the card", () => {
    expect(ru.fullName(form({ patronymic: "Винцентовна" }))).toEqual({
      given: "Ганна Винцентовна",
      surname: "Журавик",
    });
  });

  it.each([null, form({ given: null, surname: null }), form({ given: " ", surname: "" })])(
    "are unknown in words: %j",
    (name) => {
      expect(ru.name(person({ name }))).toBe("Имя неизвестно");
      expect(en.person(person({ name }))).toMatchObject({ given: "Name unknown", surname: "" });
      expect(ru.isNamed(person({ name }))).toBe(false);
    },
  );

  it("say the surname at birth when the one shown is another", () => {
    const married = person({
      name: form({ kind: "married" }),
      otherNames: [form({ surname: "Ольхович" }), form({ language: "be", surname: "Альховіч" })],
    });
    expect(ru.bornAs(married)).toBe("при рождении Ольхович");
    expect(en.bornAs(married)).toBe("born Ольхович");
    expect(ru.bornAs(person({ name: form({}) }))).toBeNull();
    const kept = person({ name: form({ kind: "married" }), otherNames: [form({})] });
    expect(ru.bornAs(kept)).toBeNull();
  });
});

describe("the words of a card", () => {
  it("have the branch, or that there is none", () => {
    expect(ru.person(person({ branch: "b1" })).branch).toBe("b1");
    expect(ru.person(person({ branch: null })).branch).toBe("без ветви");
    expect(en.person(person({ branch: "gone" })).branch).toBe("no branch");
  });

  it("have the name at birth only where the person is chosen", () => {
    const married = person({
      birth: exact("1909"),
      living: "yes",
      name: form({ kind: "married" }),
      otherNames: [form({ surname: "Ольхович" })],
    });
    expect(ru.person(married).years).toBe("1909–");
    expect(wordsOf(snapshot, "ru", "a").person(married).years).toBe("1909–, при рождении Ольхович");
  });

  it("name an unknown place", () => {
    expect(ru.unknown({ of: "parent", child: "a", parentages: ["1"] })).toBe("Родитель неизвестен");
    expect(ru.unknown({ of: "parent", child: "a", parentages: ["1", "2"] })).toBe(
      "Родители неизвестны",
    );
    expect(en.unknown({ of: "partner", partner: "a", union: "u" })).toBe("Name unknown");
  });

  it("name the people a reference means", () => {
    expect(ru.reference({ as: "parents", people: ["a", "b"], page: null })).toEqual({
      title: "Те же родители",
      detail: "a, b",
    });
    expect(ru.reference({ as: "parents", people: ["a"], page: null }).title).toBe(
      "Тот же родитель",
    );
  });

  it("say on the map which page to look at", () => {
    const words = wordsOf(snapshot, "ru").onMap;
    expect(words.reference({ as: "child", people: ["a"], page: "b1" })).toEqual({
      title: "a, см.",
      detail: "b1",
    });
    expect(words.reference({ as: "parents", people: ["a", "b"], page: "b1" })).toEqual({
      title: "Родители, см.",
      detail: "b1",
    });
    expect(words.reference({ as: "partner", people: ["b"], page: null })).toEqual({
      title: "b, см.",
      detail: "Без ветви",
    });
  });
});

it("names a place in the language of the interface, else as it is written first", () => {
  expect(ru.place("l1")).toBe("Вересень");
  expect(en.place("l1")).toBe("Верасень");
  expect(en.place("l2")).toBeNull();
  expect(en.place(null)).toBeNull();
});

it("knows the ink of a branch", () => {
  expect(ru.ink("b1")).toBe("var(--branch-1)");
  expect(ru.ink(null)).toBe("var(--no-branch)");
});
