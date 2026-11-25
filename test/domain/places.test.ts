import { describe, expect, it } from "vitest";
import { type NewPlace, type Period, placesOver } from "../../src/contexts/places";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { PlaceId } from "../../src/kernel/id";
import { MemoryPlaces } from "./memory-others";

const id = (name: string) => `place_${name}` as PlaceId;
const date = (text: string) => parseFuzzyDate(text);
const period = (from: string | null, to: string | null): Period => ({
  from: from === null ? null : date(from),
  to: to === null ? null : date(to),
});

const start = (place: Partial<NewPlace> = {}) => {
  const store = new MemoryPlaces();
  const places = placesOver(store);
  const result = places.add({
    id: id("a"),
    names: [],
    affiliations: [],
    coordinates: null,
    ...place,
  });
  if (!result.ok) throw new Error(result.error.code);
  return { store, places };
};

describe("a place", () => {
  it("is added once, with no names at all if nobody knows one", () => {
    const { places } = start();
    expect(places.get(id("a"))).toEqual({
      id: id("a"),
      version: 0,
      names: [],
      affiliations: [],
      coordinates: null,
    });
    expect(
      places.add({ id: id("a"), names: [], affiliations: [], coordinates: null }),
    ).toMatchObject({ error: { code: "duplicate" } });
    expect(places.get(id("b"))).toBeNull();
  });

  it("is edited, with the change told before and after", () => {
    const { places, store } = start();
    const coordinates = { lat: 53.9, lon: 27.6 };
    expect(places.edit(id("a"), { coordinates })).toMatchObject({
      ok: true,
      value: [
        { kind: "place", id: id("a"), before: { coordinates: null }, after: { coordinates } },
      ],
    });
    expect(store.saves).toBe(2);
    expect(places.edit(id("a"), { coordinates })).toEqual({ ok: true, value: [] });
    expect(store.saves).toBe(2);
    expect(places.edit(id("b"), {})).toEqual({
      ok: false,
      error: { code: "missing", id: id("b") },
    });
  });
});

describe("a place that is removed", () => {
  it("is gone, and was told before", () => {
    const { places } = start();
    expect(places.remove(id("a"))).toMatchObject({
      value: [{ kind: "place", id: id("a"), before: { names: [] }, after: null }],
    });
    expect(places.get(id("a"))).toBeNull();
    expect(places.remove(id("a"))).toEqual({
      ok: false,
      error: { code: "missing", id: id("a") },
    });
  });
});

describe("the name of a place", () => {
  const named = start({
    names: [
      { text: "Осочье", language: "ru", period: period(null, "1921") },
      { text: "Осочье-Костёльное", language: "ru", period: period("1921", "17.09.1939") },
      { text: "Osocze Kościelne", language: "pl", period: period("1921", "1939") },
      { text: "Осочьевск", language: "ru", period: period("1948", null) },
      { text: "Асоччаўск", language: "be", period: period("1948", null) },
    ],
  });
  const nameOn = (text: string | null, language: "ru" | "be" | "pl" | "lt" = "ru") =>
    named.places.nameOn(id("a"), text === null ? null : date(text), language);

  it("is the one of that time", () => {
    expect(nameOn("1885")).toBe("Осочье");
    expect(nameOn("до 1885")).toBe("Осочье");
    expect(nameOn("1930")).toBe("Осочье-Костёльное");
    expect(nameOn("12.05.1960")).toBe("Осочьевск");
    expect(nameOn("между 1930 и 1960")).toBe("Осочье-Костёльное");
  });

  it("is the later one where two meet", () => {
    expect(nameOn("1921")).toBe("Осочье-Костёльное");
    expect(nameOn("1948")).toBe("Осочьевск");
  });

  it("is in the language asked for, if there is one at that time", () => {
    expect(nameOn("1930", "pl")).toBe("Osocze Kościelne");
    expect(nameOn("1960", "be")).toBe("Асоччаўск");
    expect(nameOn("1885", "pl")).toBe("Осочье");
    expect(nameOn("1930", "lt")).toBe("Осочье-Костёльное");
  });

  it("is the latest when there is no date or nobody could read it", () => {
    expect(nameOn(null)).toBe("Осочьевск");
    expect(nameOn("на Покров")).toBe("Осочьевск");
    expect(nameOn(null, "pl")).toBe("Osocze Kościelne");
  });

  it("is the nearest one when none was used at that time", () => {
    expect(nameOn("1942")).toBe("Осочье-Костёльное");
    expect(nameOn("1947")).toBe("Осочьевск");
    expect(nameOn("1942", "pl")).toBe("Osocze Kościelne");
  });

  it("gives way to one with a period when its own is not known", () => {
    const { places } = start({
      names: [
        { text: "Менск", language: "be", period: null },
        { text: "Мінск", language: "be", period: period("1939", null) },
      ],
    });
    expect(places.nameOn(id("a"), date("1960"), "be")).toBe("Мінск");
    expect(places.nameOn(id("a"), date("1920"), "be")).toBe("Менск");
    expect(places.nameOn(id("a"), null, "be")).toBe("Мінск");
  });

  it("with an end only goes before one of an unknown period", () => {
    const { places } = start({
      names: [
        { text: "Осочьевск", language: "ru", period: null },
        { text: "Осочье", language: "ru", period: period(null, "1921") },
      ],
    });
    expect(places.nameOn(id("a"), date("1900"), "ru")).toBe("Осочье");
  });

  it("that has ended gives way when there is no date", () => {
    const { places } = start({
      names: [
        { text: "Осочье", language: "ru", period: period("1795", "1921") },
        { text: "Осочьевск", language: "ru", period: null },
      ],
    });
    expect(places.nameOn(id("a"), null, "ru")).toBe("Осочьевск");
    expect(places.nameOn(id("a"), date("1900"), "ru")).toBe("Осочье");
  });

  it("that ended after a date is known to have been used to that date", () => {
    for (const now of [null, period(null, null)]) {
      const { places } = start({
        names: [
          { text: "Осочье", language: "ru", period: period("1900", "после 1918") },
          { text: "Осочьевск", language: "ru", period: now },
        ],
      });
      const nameAt = (text: string) => places.nameOn(id("a"), date(text), "ru");
      expect(places.nameOn(id("a"), null, "ru")).toBe("Осочьевск");
      expect(nameAt("1.01.1900")).toBe("Осочье");
      expect(nameAt("31.12.1918")).toBe("Осочье");
      expect(nameAt("1.01.1919")).toBe("Осочьевск");
    }
  });

  it("that ended nobody knows when is used on any date, but is not the latest", () => {
    const { places } = start({
      names: [
        { text: "Осочье", language: "ru", period: period("1900", "при немцах") },
        { text: "Осочьевск", language: "ru", period: null },
      ],
    });
    expect(places.nameOn(id("a"), date("1.01.1900"), "ru")).toBe("Осочье");
    expect(places.nameOn(id("a"), date("1905"), "ru")).toBe("Осочье");
    expect(places.nameOn(id("a"), null, "ru")).toBe("Осочьевск");
  });

  it("that began before a date is known to have been used from that date", () => {
    const { places } = start({
      names: [
        { text: "Осочье", language: "ru", period: null },
        { text: "Осочьевск", language: "ru", period: period("до 1922", null) },
      ],
    });
    expect(places.nameOn(id("a"), date("1950"), "ru")).toBe("Осочьевск");
    expect(places.nameOn(id("a"), date("31.12.1921"), "ru")).toBe("Осочьевск");
    expect(places.nameOn(id("a"), date("30.12.1921"), "ru")).toBe("Осочье");
  });

  it("in the language asked for may have begun within the date", () => {
    const { places } = start({
      names: [
        { text: "Osocze", language: "pl", period: period("1900", null) },
        { text: "Осочьевск", language: "ru", period: period("11.11.1918", null) },
      ],
    });
    expect(places.nameOn(id("a"), date("1918"), "ru")).toBe("Осочьевск");
    expect(places.nameOn(id("a"), date("1918"), "lt")).toBe("Osocze");
    expect(places.nameOn(id("a"), date("10.1918"), "ru")).toBe("Osocze");
  });

  it("with a period nobody could read is as one without", () => {
    const { places } = start({
      names: [
        { text: "Осочье", language: "ru", period: period("при панах", null) },
        { text: "Осочьевск", language: "ru", period: period("1948", null) },
      ],
    });
    expect(places.nameOn(id("a"), date("1960"), "ru")).toBe("Осочьевск");
    expect(places.nameOn(id("a"), date("1900"), "ru")).toBe("Осочье");
  });

  it("is none for a place without names and for one that is missing", () => {
    const { places } = start();
    expect(places.nameOn(id("a"), null, "ru")).toBeNull();
    expect(places.nameOn(id("b"), null, "ru")).toBeNull();
  });
});

describe("the affiliation of a place", () => {
  const { places } = start({
    affiliations: [
      { name: "Российская империя", period: period("1795", "1917") },
      { name: "Польская Республика", period: period("1921", "1939") },
      { name: "БССР", period: period("1939", "1991") },
    ],
  });
  const on = (text: string | null) =>
    places.affiliationOn(id("a"), text === null ? null : date(text));

  it("is the one of that time, and none between two", () => {
    expect(on("1885")).toBe("Российская империя");
    expect(on("1930")).toBe("Польская Республика");
    expect(on("1939")).toBe("БССР");
    expect(on("1919")).toBeNull();
    expect(on("12.05.1917")).toBe("Российская империя");
  });

  it("before a date and after one is that of the day before and the day after", () => {
    expect(on("до 1921")).toBeNull();
    expect(on("до 1918")).toBe("Российская империя");
    expect(on("до 1.01.1918")).toBe("Российская империя");
    expect(on("после 1920")).toBe("Польская Республика");
    expect(on("после 31.12.1920")).toBe("Польская Республика");
    expect(on("после 1917")).toBeNull();
  });

  it("of a year or of a span is the one of its first day, else the first to come in it", () => {
    const { places: precise } = start({
      affiliations: [
        { name: "Империя", period: period("1795", "1917") },
        { name: "Республика", period: period("11.11.1918", "17.09.1939") },
        { name: "БССР", period: period("17.09.1939", "после 1990") },
      ],
    });
    const of = (text: string) => precise.affiliationOn(id("a"), date(text));
    for (const text of ["1918", "11.1918", "около 1918", "между 1918 и 1960", "1939", "09.1939"]) {
      expect([text, of(text)]).toEqual([text, "Республика"]);
    }
    expect(of("10.11.1918")).toBeNull();
    expect(of("17.09.1939")).toBe("БССР");
    expect(of("1990")).toBe("БССР");
    const { places: unordered } = start({
      affiliations: [
        { name: "БССР", period: period("1939", null) },
        { name: "Республика", period: period("1921", "1939") },
      ],
    });
    expect(unordered.affiliationOn(id("a"), date("между 1900 и 1960"))).toBe("Республика");
    const { places: vague } = start({
      affiliations: [
        { name: "БССР", period: null },
        { name: "Республика", period: period("1921", "1939") },
      ],
    });
    expect(vague.affiliationOn(id("a"), date("05.1939"))).toBe("Республика");
    const { places: ended } = start({
      affiliations: [
        { name: "Империя", period: period("1795", "после 1910") },
        { name: "Республика", period: period("11.11.1918", "1939") },
      ],
    });
    expect(ended.affiliationOn(id("a"), date("1910"))).toBe("Империя");
    expect(ended.affiliationOn(id("a"), date("1918"))).toBe("Республика");
    expect(ended.affiliationOn(id("a"), date("1950"))).toBeNull();
    expect(ended.affiliationOn(id("a"), date("после 1917"))).toBeNull();
    const { places: crossed } = start({
      affiliations: [{ name: "Империя", period: period("до 1922", "1918") }],
    });
    expect(crossed.affiliationOn(id("a"), date("31.12.1918"))).toBe("Империя");
    expect(crossed.affiliationOn(id("a"), date("1918"))).toBe("Империя");
    expect(crossed.affiliationOn(id("a"), date("1921"))).toBeNull();
    const { places: after } = start({
      affiliations: [
        { name: "Империя", period: period("1795", "1917") },
        { name: "Советы", period: period("после 1917", null) },
      ],
    });
    expect(after.affiliationOn(id("a"), date("05.1917"))).toBe("Империя");
    expect(after.affiliationOn(id("a"), date("1918"))).toBe("Советы");
  });

  it("is none without a date that was read, or for a missing place", () => {
    expect(on(null)).toBeNull();
    expect(on("при панах")).toBeNull();
    expect(places.affiliationOn(id("b"), date("1885"))).toBeNull();
  });
});
