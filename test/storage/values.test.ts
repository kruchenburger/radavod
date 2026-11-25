import { describe, expect, it } from "vitest";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import {
  fuzzyDateSchema,
  memberIdSchema,
  nameFormSchema,
  personIdSchema,
} from "../../src/shared/values";
import { form, person } from "./tree";

describe("an identifier", () => {
  it("is a kind and 22 characters of base58", () => {
    expect(personIdSchema.safeParse(person("ada")).success).toBe(true);
    const digits = "1".repeat(21);
    for (const last of ["0", "O", "I", "l", "", "11", "-", "\n", "я"]) {
      expect([last, personIdSchema.safeParse(`person_${digits}${last}`).success]).toEqual([
        last,
        false,
      ]);
    }
    for (const value of [null, 1, {}, "", "person_", `union_${digits}1`, `xperson_${digits}1`]) {
      expect(personIdSchema.safeParse(value).success).toBe(false);
    }
    expect(memberIdSchema.safeParse(person("ada")).success).toBe(false);
  });
});

describe("values of the kernel", () => {
  it.each(["12.05.1885", "между 1880 и 1885", "до мая 1885 ст. ст.", "на Покров", ""])(
    "take the date %j as the kernel reads it",
    (text) => {
      const date = parseFuzzyDate(text);
      expect(fuzzyDateSchema.parse(JSON.parse(JSON.stringify(date)))).toEqual(date);
    },
  );

  it("take nothing more and nothing less", () => {
    const wrong = [
      { text: "1885" },
      { text: "1885", parsed: null, more: 1 },
      { text: "1885", parsed: { qualifier: "exact", calendar: "gregorian", from: {} } },
      { text: "x", parsed: { qualifier: "x", calendar: "gregorian", from: { year: 1 } } },
      {
        text: "x",
        parsed: { qualifier: "exact", calendar: "gregorian", from: { year: 1, month: 13 } },
      },
      {
        text: "x",
        parsed: { qualifier: "exact", calendar: "gregorian", from: { year: 1, month: undefined } },
      },
      {
        text: "x",
        parsed: { qualifier: "exact", calendar: "gregorian", from: { year: 1 }, to: undefined },
      },
    ];
    for (const date of wrong) expect(fuzzyDateSchema.safeParse(date).success).toBe(false);
    expect(nameFormSchema.safeParse(form("n1")).success).toBe(true);
    expect(nameFormSchema.safeParse({ ...form("n1"), more: 1 }).success).toBe(false);
    expect(nameFormSchema.safeParse({ ...form("n1"), given: null }).success).toBe(false);
  });
});
