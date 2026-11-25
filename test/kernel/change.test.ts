import { describe, expect, it } from "vitest";
import { writes } from "../../src/kernel/change";
import { lastDay, parseFuzzyDate, sortKey } from "../../src/kernel/fuzzy-date";

describe("a write", () => {
  it("is of one aggregate before and after", () => {
    expect(writes("thing", "t1", null, { a: 1 })).toEqual([
      { kind: "thing", id: "t1", before: null, after: { a: 1 } },
    ]);
    expect(writes("thing", "t1", { a: 1 }, null)).toHaveLength(1);
    expect(writes("thing", "t1", { a: [1, 2] }, { a: [2, 1] })).toHaveLength(1);
  });

  it("is none when nothing differs, in whatever order the keys stand", () => {
    expect(writes("thing", "t1", null, null)).toEqual([]);
    expect(writes("thing", "t1", { a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toEqual(
      [],
    );
  });
});

describe("the last day of a date", () => {
  const last = (text: string) => lastDay(parseFuzzyDate(text));
  const first = (text: string) => sortKey(parseFuzzyDate(text));

  it("is the last it can be read as", () => {
    expect(last("12.05.1885")).toBe(first("12.05.1885"));
    expect(last("05.1885")).toBe(first("31.05.1885"));
    expect(last("02.1884")).toBe(first("29.02.1884"));
    expect(last("12.1885")).toBe(first("31.12.1885"));
    expect(last("1885")).toBe(first("31.12.1885"));
    expect(last("около 1885")).toBe(first("31.12.1885"));
    expect(last("до 1885")).toBe(first("31.12.1885"));
    expect(last("между 1880 и маем 1885")).toBe(first("31.05.1885"));
    expect(last("1885 ст. ст.")).toBe(first("12.01.1886"));
    expect(last("02.1900 ст. ст.")).toBe(first("13.03.1900"));
  });

  it("is none after a date and in an unread one", () => {
    expect(last("после 1885")).toBeNull();
    expect(last("на Покров 1885")).toBeNull();
  });
});
