import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { oldSpelling } from "../../examples/names.ts";
import { yearOf } from "../../examples/snapshot.ts";
import { type ParsedDate, parseFuzzyDate, sortKey } from "../../src/kernel/fuzzy-date.ts";
import { foldName } from "../../src/kernel/name-form.ts";

// The example family knows nothing of the kernel: it says what its dates mean on its own.
const family = generateFamily(1, 300);
const dates = family.events.flatMap(({ date }) => (date === null ? [] : [date]));
/** A feast is a day for a person, but the kernel knows no feasts. */
const isByFeast = ({ text }: { text: string }) => text.startsWith("на Покров");

describe("the dates of the example family", () => {
  it("are read as they were meant", () => {
    const meant = dates.filter((date) => !isByFeast(date));
    expect(meant.length).toBeGreaterThan(500);
    expect(new Set(meant.map(({ parsed }) => parsed?.qualifier)).size).toBe(6);
    for (const { text, parsed } of meant) {
      const read = parseFuzzyDate(text).parsed;
      const { qualifier, from, to } = parsed ?? {};
      expect([text, read?.qualifier, read?.from, read?.to ?? null]).toEqual([
        text,
        qualifier,
        from,
        to ?? null,
      ]);
      // No text names its calendar, and the kernel does not guess one.
      if (read !== null) expect(read.calendar).toBe("gregorian");
    }
  });

  it("stay text when they go by a feast", () => {
    const feasts = dates.filter(isByFeast);
    expect(feasts.length).toBeGreaterThan(0);
    for (const { text } of feasts) expect(parseFuzzyDate(text).parsed).toBeNull();
  });

  it("sort as the snapshot sorts them", () => {
    for (const date of dates) {
      const { text, parsed: meant } = date;
      let parsed: ParsedDate | null = null;
      if (meant !== null) {
        const { qualifier, calendar, from, to } = meant;
        parsed = { qualifier, calendar, from, ...(to === null ? {} : { to }) };
      }
      expect([text, sortKey({ text, parsed })]).toEqual([text, yearOf(date).sort]);
    }
  });
});

it("finds every name of the example family in the old spelling", () => {
  const names = new Set(
    family.people.flatMap((person) =>
      person.names.flatMap(({ given, patronymic, surname }) => [given, patronymic, surname]),
    ),
  );
  expect(names.size).toBeGreaterThan(100);
  for (const name of names) {
    if (name !== null) expect([name, foldName(oldSpelling(name))]).toEqual([name, foldName(name)]);
  }
});
