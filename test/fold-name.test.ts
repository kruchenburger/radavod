import fc from "fast-check";
import { expect, it } from "vitest";
import { foldName } from "../src/kernel/fold-name";

it.each([
  ["Фёдоръ", "федор"],
  ["Łukasz", "lukasz"],
  ["Ольхуничъ", "ольхунич"],
  // Old letters, each by its modern one.
  ["Викентій", "Викентий"],
  ["Матѳей", "Матфей"],
  ["Лѣсникъ", "Лесник"],
  ["Мѵро", "Миро"],
  // Belarusian and Ukrainian letters are found by the Russian ones.
  ["Вінцэнтаўна", "Винцэнтауна"],
  ["Ґанна", "Ганна"],
  // Apostrophes of all kinds are the same.
  ["Дзям’ян", "Дзямян"],
  ["Дзям'ян", "Дзямʼян"],
  ["Olchovičiūtė", "Olchoviciute"],
  ["Żółć", "zolc"],
  ["Straße", "strasse"],
  ["Æsir Þór Đorđe Øre", "aesir thor dorde ore"],
  ["  Анна   Мария ", "анна мария"],
  ["Рябинник‑Туманик", "Рябинник-Туманик"],
])("finds %s by %s", (a, b) => {
  expect(foldName(a)).toBe(foldName(b));
});

it("keeps apart letters that mean different sounds", () => {
  expect(foldName("Бай")).not.toBe(foldName("Баи"));
  expect(foldName("Шин")).not.toBe(foldName("Щин"));
});

it("takes points off Hebrew letters", () => {
  expect(foldName("שָׁלוֹם")).toBe(foldName("שלום"));
});

it("is done after one folding and never fails", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary" }), (text) => {
      const folded = foldName(text);
      expect(foldName(folded)).toBe(folded);
    }),
  );
});
