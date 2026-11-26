import { describe, expect, it } from "vitest";
import { around } from "../../../web/tree/layout/around";
import { aroundNarrow } from "../../../web/tree/layout/around-narrow";
import { branchPages } from "../../../web/tree/layout/branch-pages";
import { generations } from "../../../web/tree/layout/generations";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";

// Nobody has such a family. A drawing is slow and ugly then, and still a drawing.
const many = Array.from({ length: 3000 }, (_, i) => i);

const families: Record<string, FamilySpec> = {
  "three thousand generations": {
    people: many.map((i) => ({
      id: `p${i}`,
      branch: "A",
      parents: i === 0 ? [] : [`p${i - 1}`],
    })),
    branches: ["A"],
  },
  "three thousand children": {
    people: ["p0", ...many.map((i) => ({ id: `c${i}`, parents: ["p0"], born: i }))],
  },
  "three thousand partners": {
    people: ["p0", ...many.map((i) => `w${i}`)],
    unions: many.map((i): [string, string] => ["p0", `w${i}`]),
  },
  "three thousand parents": {
    people: [
      ...many.map((i) => `f${i}`),
      { id: "p0", parents: many.map((i) => ({ parent: `f${i}`, main: i === 0 })) },
    ],
  },
  "three thousand people without kin": { people: many.map((i) => `p${i}`) },
  "three thousand branches": {
    people: many.map((i) => ({ id: `p${i}`, branch: `b${i}` })),
    branches: many.map((i) => `b${i}`),
  },
};

describe.each(Object.entries(families))("%s", (_, spec) => {
  const snapshot = familyOf(spec);
  const options = { measure, wording: wordingOf(snapshot), lineOf: "p0" };

  it("have a drawing around a person", () => {
    const layout = around(snapshot, "p0", options);
    expect(layout.cards.length).toBeGreaterThan(0);
    expect(Number.isFinite(layout.width + layout.height)).toBe(true);
  }, 60_000);

  it("have a list", () => {
    const layout = aroundNarrow(snapshot, "p0", { ...options, width: 328 });
    expect(Number.isFinite(layout.width + layout.height)).toBe(true);
  }, 60_000);

  it("have a tree by generations", () => {
    const layout = generations(snapshot, "p0", options);
    expect(layout.cards.length).toBeGreaterThan(0);
    expect(Number.isFinite(layout.width + layout.height)).toBe(true);
  }, 60_000);

  it("have pages", () => {
    const { pages } = branchPages(snapshot, snapshot.people.at(-1)?.id ?? null);
    expect(pages.reduce((sum, { entries }) => sum + entries.length, 0)).toBeGreaterThan(0);
  }, 60_000);
});
