import { expect, it } from "vitest";
import { createT, detectLocale } from "../../web/i18n/t";

const ru = {
  "people.count": {
    one: "{count} человек",
    few: "{count} человека",
    many: "{count} человек",
    other: "{count} человека",
  },
  "person.born": "{name}, родился в {year}",
};
const en = {
  "people.count": { one: "{count} person", other: "{count} people" },
  "person.born": "{name}, born {year}",
};

const t = createT({ ru, en });

it.each([
  [1, "1 человек"],
  [3, "3 человека"],
  [11, "11 человек"],
  [21, "21 человек"],
  [0, "0 человек"],
  [5000, "5 000 человек"],
])("counts people in Russian: %i", (count, text) => {
  expect(t("ru", "people.count", { count })).toBe(text);
});

it.each([
  [1, "1 person"],
  [2, "2 people"],
  [11, "11 people"],
  [5000, "5,000 people"],
])("counts people in English: %i", (count, text) => {
  expect(t("en", "people.count", { count })).toBe(text);
});

it("puts parameters in as they are", () => {
  // A year is a number too, but only a count is grouped.
  expect(t("ru", "person.born", { name: "$& {year}", year: 1885 })).toBe(
    "$& {year}, родился в 1885",
  );
});

it("leaves a placeholder without a parameter visible", () => {
  expect(t("en", "person.born", { name: "Alesia" })).toBe("Alesia, born {year}");
});

it.each([
  [["en-GB", "ru"], "en"],
  [["pl-PL", "ru-RU", "en"], "ru"],
  [["EN"], "en"],
  // No Belarusian or Ukrainian yet, and Russian is the nearer of the two.
  [["be", "en"], "ru"],
  [["pl", "uk-UA"], "ru"],
  // Whoever reads neither gets English.
  [["pl", "de"], "en"],
  [[], "en"],
])("starts from the languages of the browser: %j", (languages, locale) => {
  expect(detectLocale(languages)).toBe(locale);
});
