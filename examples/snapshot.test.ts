import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { treeSnapshotSchema } from "../src/shared/tree.ts";
import type { FuzzyDate } from "./family.ts";
import { generateFamily } from "./generate.ts";
import { dayNumber, snapshotOf, yearOf } from "./snapshot.ts";

const family = generateFamily(1, 300);
const snapshot = snapshotOf(family);
const byId = new Map(snapshot.people.map((person) => [person.id, person]));

describe("the snapshot of the invented family", () => {
  it("is what the contract says", () => {
    expect(treeSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("has every person, union and branch", () => {
    expect(snapshot.people.map(({ id }) => id)).toEqual(family.people.map(({ id }) => id));
    expect(snapshot.unions.map(({ id }) => id)).toEqual(family.unions.map(({ id }) => id));
    expect(snapshot.branches.map(({ title }) => title.ru)).toEqual(
      family.branches.map(({ name }) => name.ru),
    );
  });

  it("has every parentage with its kind, its flag and its certainty", () => {
    const told = snapshot.people.flatMap(({ id, parents }) =>
      parents.map((parentage) => ({ child: id, ...parentage })),
    );
    const order = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1);
    expect(told.sort(order)).toEqual([...family.parentages].sort(order));
  });

  it("counts branch colors from 0", () => {
    expect(snapshot.branches.map(({ color }) => color)).toEqual(
      family.branches.map(({ color }) => color - 1),
    );
  });

  it("shows the main birth and death, not their second versions", () => {
    for (const { kind, main, participants, date } of family.events) {
      if ((kind !== "birth" && kind !== "death") || !main) continue;
      const person = byId.get(participants[0]?.person ?? "");
      expect(person?.[kind]).toEqual(date === null ? null : yearOf(date));
    }
  });

  it("shows the first name form and keeps the rest for the search", () => {
    for (const { id, names } of family.people) {
      const person = byId.get(id);
      const forms = [person?.name ?? null, ...(person?.otherNames ?? [])];
      expect(forms.map((form) => form?.given ?? null)).toEqual(
        names.length === 0 ? [null] : names.map(({ given }) => given),
      );
    }
  });

  it("knows when a union began, if a wedding is dated", () => {
    const dated = family.events.filter(({ kind, date }) => kind === "wedding" && date?.parsed);
    expect(snapshot.unions.filter(({ began }) => began !== null)).toHaveLength(dated.length);
  });

  it("names the place of birth, or of death", () => {
    expect(snapshot.people.filter(({ place }) => place !== null).length).toBeGreaterThan(250);
    const places = new Set(snapshot.places.map(({ id }) => id));
    for (const { place } of snapshot.people) if (place !== null) expect(places).toContain(place);
  });

  it("carries no citations, no sources and no events", () => {
    expect(Object.keys(snapshot).sort()).toEqual(
      ["branches", "format", "people", "places", "unions", "version"].sort(),
    );
  });
});

describe("a year", () => {
  const date = (parsed: Partial<NonNullable<FuzzyDate["parsed"]>>, text = "x"): FuzzyDate => ({
    text,
    parsed: {
      qualifier: "exact",
      precision: "year",
      calendar: "gregorian",
      from: { year: 1885 },
      to: null,
      ...parsed,
    },
  });

  it("is shown in digits, and what it means is a code", () => {
    expect(yearOf(date({}))).toMatchObject({ text: "1885", qualifier: "exact" });
    expect(yearOf(date({ qualifier: "about" }))).toMatchObject({ text: "1885", qualifier: "about" });
    expect(yearOf(date({ qualifier: "between", to: { year: 1890 } }))).toMatchObject({
      text: "1885–1890",
      qualifier: "between",
    });
  });

  it("is what the source says when nobody could read it", () => {
    expect(yearOf({ text: "в голодный год", parsed: null })).toEqual({
      text: "в голодный год",
      qualifier: "unread",
      sort: null,
    });
  });

  it("sorts by the earliest possible day in one calendar", () => {
    expect(dayNumber({ year: 2000, month: 1, day: 1 }, "gregorian")).toBe(2451545);
    expect(dayNumber({ year: 1900, month: 2, day: 28 }, "julian")).toBe(
      dayNumber({ year: 1900, month: 3, day: 12 }, "gregorian"),
    );
    expect(yearOf(date({ from: { year: 1885, month: 5 } })).sort).toBe(
      dayNumber({ year: 1885, month: 5, day: 1 }, "gregorian"),
    );
  });
});

it("is written where the app fetches it from", () => {
  const folder = mkdtempSync(join(tmpdir(), "radavod-sample-"));
  try {
    execFileSync(process.execPath, [
      fileURLToPath(new URL("write-sample.ts", import.meta.url)),
      folder,
    ]);
    const written: unknown = JSON.parse(readFileSync(join(folder, "sample/tree.json"), "utf8"));
    expect(treeSnapshotSchema.parse(written)).toEqual(snapshot);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("is part of the build, after the folder is emptied", () => {
  const { scripts } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts: { build: string } };
  expect(scripts.build).toBe("vite build && node examples/write-sample.ts dist/client");
});
