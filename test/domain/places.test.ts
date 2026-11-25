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

  it("is the first one when none was used at that time", () => {
    expect(nameOn("1942")).toBe("Осочье");
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

  it("is none without a date that was read, or for a missing place", () => {
    expect(on(null)).toBeNull();
    expect(on("при панах")).toBeNull();
    expect(places.affiliationOn(id("b"), date("1885"))).toBeNull();
  });
});
