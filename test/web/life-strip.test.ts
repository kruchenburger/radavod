import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import type { TreePerson, TreeSnapshot, TreeYear } from "../../src/shared/tree";
import { lifeStrip, type Life } from "../../web/tree/person/life-strip";
import { familyOf, type FamilySpec } from "./layout/family";

const today = 2026;
const options = { today, before: 45 };

const year = (text: string, qualifier: TreeYear["qualifier"] = "exact"): TreeYear => ({
  text,
  qualifier,
  sort: qualifier === "unread" || qualifier === "before" ? null : Number(text.slice(0, 4)) * 365,
});
type Years = Partial<Pick<TreePerson, "birth" | "death" | "living">>;

function strip(years: Record<string, Years>, spec: FamilySpec, person = "me") {
  const snapshot: TreeSnapshot = familyOf(spec);
  for (const one of snapshot.people) {
    Object.assign(one, { living: "no" }, years[one.id]);
  }
  return lifeStrip(snapshot, person, options);
}

function lifeOf(years: Years, spec: FamilySpec = { people: ["me"] }, more = {}): Life {
  const own = strip({ me: years, ...more }, spec)?.groups[0]?.lives[0];
  if (own === undefined) throw new Error("no life");
  return own;
}

describe("the ends of a bar", () => {
  it("have a cap where the year is known", () => {
    const { bar } = lifeOf({ birth: year("1909"), death: year("1987") });
    expect(bar).toEqual({
      start: { inner: 1909, outer: 1909, has: "cap" },
      end: { inner: 1987, outer: 1987, has: "cap" },
    });
  });

  it("have three years of dashes about a year", () => {
    const { bar } = lifeOf({ birth: year("1906", "about"), death: year("1971") });
    expect(bar?.start).toEqual({ inner: 1907.5, outer: 1904.5, has: null });
    expect(bar?.end.has).toBe("cap");
  });

  it.each([
    ["before", "birth", { inner: 1900, outer: 1897 }],
    ["after", "birth", { inner: 1903, outer: 1900 }],
    ["before", "death", { inner: 1897, outer: 1900 }],
    ["after", "death", { inner: 1900, outer: 1903 }],
  ] as const)("have them %s the year of a %s", (qualifier, what, expected) => {
    const other = what === "birth" ? { death: year("1950") } : { birth: year("1850") };
    const { bar } = lifeOf({ ...other, [what]: year("1900", qualifier) });
    expect(what === "birth" ? bar?.start : bar?.end).toEqual({ ...expected, has: null });
  });

  it("have them between two years", () => {
    const { bar } = lifeOf({
      birth: year("1880–1885", "between"),
      death: year("1940–1944", "between"),
    });
    expect(bar).toEqual({
      start: { inner: 1885, outer: 1880, has: null },
      end: { inner: 1940, outer: 1944, has: null },
    });
  });

  it("run to today for the living", () => {
    const { bar } = lifeOf({ birth: year("1961"), living: "yes" });
    expect(bar?.end).toEqual({ inner: today, outer: today, has: null });
  });

  it("stop at the last known event with a question when nobody knows", () => {
    const spec: FamilySpec = {
      people: ["me", "wife", { id: "child", parents: ["me", "wife"] }],
      unions: [["me", "wife"]],
    };
    const { bar } = lifeOf({ birth: year("1860") }, spec, { child: { birth: year("1890") } });
    expect(bar?.end).toEqual({ inner: 1890, outer: 1890, has: "question" });
    const late = lifeOf({ death: year("1920") }, spec, { child: { birth: year("1890") } });
    expect(late.bar?.start).toEqual({ inner: 1890, outer: 1890, has: "question" });
    const alone = lifeOf({ birth: year("1860") });
    expect(alone.bar?.end).toEqual({ inner: 1860, outer: 1860, has: "question" });
  });

  it("never cross", () => {
    const { bar } = lifeOf({ birth: year("1900", "about"), death: year("1901", "about") });
    expect(bar?.start.inner).toBeLessThanOrEqual(bar?.end.inner ?? 0);
    const wrong = lifeOf({ birth: year("1950"), death: year("1900") });
    expect(wrong.bar?.start.inner).toBeLessThanOrEqual(wrong.bar?.end.inner ?? 0);
  });

  it("are nothing where no year can be read", () => {
    const spec: FamilySpec = { people: ["me", { id: "child", parents: ["me"] }] };
    const own = strip({ me: { birth: year("1900"), death: year("1950") }, child: {} }, spec);
    expect(own?.groups.at(-1)?.lives[0]).toMatchObject({ person: "child", bar: null });
    const unread = strip(
      { me: { birth: year("1900") }, child: { birth: year("на Покров", "unread") } },
      spec,
    );
    expect(unread?.groups.at(-1)?.lives[0]?.bar).toBeNull();
  });
});

describe("the scale", () => {
  const spec: FamilySpec = {
    people: ["father", { id: "me", parents: ["father"] }, { id: "child", parents: ["me"] }],
  };

  it("has the parents and goes on to the last of the kin", () => {
    const own = strip(
      {
        father: { birth: year("1880"), death: year("1949") },
        me: { birth: year("1909"), death: year("1987") },
        child: { birth: year("1931"), living: "yes" },
      },
      spec,
    );
    expect(own?.from).toBeLessThanOrEqual(1880);
    expect(own?.to).toBeGreaterThanOrEqual(today);
    expect(own?.today).toBe(today);
    expect(own?.span).toEqual({ from: 1909, to: 1987 });
    expect(own?.groups.map(({ as }) => as)).toEqual(["self", "parents", "children"]);
  });

  it("does not go further back than it is told", () => {
    const own = strip(
      { father: { birth: year("1800"), death: year("1880") }, me: { birth: year("1870") } },
      spec,
    );
    expect(own?.from).toBeGreaterThanOrEqual(1870 - 50);
    expect(own?.today).toBeNull();
  });

  it("is of the kin when nothing is known of the person", () => {
    const own = strip({ father: { birth: year("1800") } }, spec);
    expect(own?.span).toBeNull();
    expect(own?.groups[0]?.lives[0]?.bar).toBeNull();
  });

  it("is not there when nobody has a year", () => {
    expect(strip({}, spec)).toBeNull();
    expect(strip({}, spec, "nobody")).toBeNull();
  });
});

it("draws everybody of the invented family", () => {
  const { snapshot } = sampleOf(generateFamily(1, 300));
  for (const { id, birth } of snapshot.people) {
    const own = lifeStrip(snapshot, id, options);
    if (own === null) {
      expect(birth?.qualifier ?? "unread").toBe("unread");
      continue;
    }
    expect(own.to).toBeGreaterThan(own.from);
    for (const { bar } of own.groups.flatMap(({ lives }) => lives)) {
      if (bar === null) continue;
      const ends = [bar.start.outer, bar.start.inner, bar.end.inner, bar.end.outer];
      expect(ends.every(Number.isFinite)).toBe(true);
      expect(ends).toEqual([...ends].sort((a, b) => a - b));
    }
  }
});
