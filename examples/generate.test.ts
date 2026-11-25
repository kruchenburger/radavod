import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serialize } from "./family.ts";
import { generateFamily } from "./generate.ts";
import { hardCases } from "./hard-cases.ts";
import { kinOf } from "./kin.ts";
import { problems } from "./problems.ts";

const family = generateFamily(1, 300);
const committed = readFileSync(new URL("family.json", import.meta.url), "utf8");
const forms = family.people.flatMap(({ names }) => names);
const dates = family.events.flatMap(({ date }) => (date?.parsed ? [date.parsed] : []));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the same family every time", () => {
  it("equals the committed file", () => {
    expect(committed === serialize(family), "run `pnpm examples`, commit family.json").toBe(true);
    expect(JSON.parse(committed)).toEqual(family);
  });

  it("depends on the seed and the size alone", () => {
    const forbidden = (): never => {
      throw new Error("not the same on every machine");
    };
    vi.spyOn(Math, "random").mockImplementation(forbidden);
    vi.spyOn(String.prototype, "localeCompare").mockImplementation(forbidden);
    vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(forbidden);
    vi.spyOn(String.prototype, "toLocaleUpperCase").mockImplementation(forbidden);
    vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(forbidden);
    vi.stubGlobal("Date", undefined);
    vi.stubGlobal("Intl", undefined);
    const again = serialize(generateFamily(1, 300));
    vi.unstubAllGlobals();
    expect(again).toBe(committed);
  });

  it("gives every caller a family of its own", () => {
    const first = generateFamily(1, 300);
    first.places[0]!.names.length = 0;
    first.places[0]!.affiliations[0]!.name.ru = "changed";
    first.branches[0]!.name.ru = "changed";
    expect(generateFamily(1, 300)).toEqual(family);
  });

  it("changes with the seed", () => {
    expect(generateFamily(2, 300)).not.toEqual(family);
  });

  it.each([200, 299, 301, 1000, 1001, 5000])("has exactly %i people when asked", (size) => {
    const other = generateFamily(1, size);
    expect(other.people).toHaveLength(size);
    expect(problems(other)).toEqual([]);
  });

  it.each([0, -1, 50, 300.5, Number.NaN])("refuses the size %s", (size) => {
    expect(() => generateFamily(1, size)).toThrow(RangeError);
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN])("refuses the seed %s", (seed) => {
    expect(() => generateFamily(seed, 300)).toThrow(RangeError);
  });

  it("is sound and has every hard case for other seeds", () => {
    for (let seed = 0; seed <= 40; seed += 1) {
      const other = generateFamily(seed, 300);
      const missing = Object.entries(hardCases(other)).filter(([, found]) => found.length === 0);
      expect([seed, missing, problems(other)]).toEqual([seed, [], []]);
    }
  });
});

describe("the shape", () => {
  const kin = kinOf(family);
  const depth = (id: string): number => 1 + Math.max(0, ...kin.parents(id).map(depth));
  const branchOf = new Map(family.people.map(({ id, branch }) => [id, branch]));

  it("has ten branches, each with a name and a color of its own from the set of twelve", () => {
    expect(family.branches).toHaveLength(10);
    expect(new Set(family.branches.map(({ name }) => name.ru)).size).toBe(10);
    expect(new Set(family.branches.map(({ name }) => name.en)).size).toBe(10);
    const colors = family.branches.map(({ color }) => color);
    expect(new Set(colors).size).toBe(10);
    expect(colors.every((color) => color >= 1 && color <= 12)).toBe(true);
  });

  it("has people in every branch", () => {
    for (const { id } of family.branches) {
      expect(family.people.filter(({ branch }) => branch === id).length).toBeGreaterThan(5);
    }
  });

  it("has seven generations", () => {
    expect(Math.max(...family.people.map(({ id }) => depth(id)))).toBe(7);
  });

  it("joins all branches in the last couple", () => {
    const { partners } = family.unions.find(({ id }) => id === family.lastCouple)!;
    const branches = partners.map((id) =>
      [...new Set([...kin.ancestors(id)].map((ancestor) => branchOf.get(ancestor)))].filter(
        Boolean,
      ),
    );
    expect(branches.map((list) => list.length)).toEqual([5, 5]);
    expect(new Set(branches.flat()).size).toBe(10);
    expect(partners.map(depth)).toEqual([7, 7]);
    expect(partners.flatMap(kin.children)).toEqual([]);
  });

  it.each<[string, string[], string[]]>([
    ["sex", family.people.map((p) => p.sex), ["female", "male", "unknown"]],
    ["living", family.people.map((p) => p.living), ["no", "unknown", "yes"]],
    ["language", forms.map((f) => f.language), ["be", "en", "la", "lt", "pl", "ru", "yi"]],
    ["script", forms.map((f) => f.script), ["Cyrl", "Hebr", "Latn"]],
    ["name form", forms.map((f) => f.kind), ["birth", "church", "married", "nickname", "variant"]],
    [
      "parentage",
      family.parentages.map((p) => p.kind),
      ["adoption", "blood", "guardianship", "unknown"],
    ],
    ["union", family.unions.map((u) => u.kind), ["civil", "marriage", "unknown"]],
    [
      "event",
      family.events.map((e) => e.kind),
      ["baptism", "birth", "burial", "death", "divorce", "emigration", "wedding"],
    ],
    [
      "role",
      family.events.flatMap((e) => e.participants.map((p) => p.role)),
      ["godparent", "principal", "witness"],
    ],
    ["qualifier", dates.map((d) => d.qualifier), ["about", "after", "before", "between", "exact"]],
    ["precision", dates.map((d) => d.precision), ["day", "month", "year"]],
    ["calendar", dates.map((d) => d.calendar), ["gregorian", "julian"]],
    [
      "source",
      family.sources.map((s) => s.kind),
      ["census", "document", "photo", "register", "story"],
    ],
  ])("has every kind of %s", (_what, found, expected) => {
    expect([...new Set(found)].sort()).toEqual(expected);
  });

  it.each([
    ["name form", forms],
    ["parentage", family.parentages],
    ["union", family.unions],
    ["event", family.events],
  ])("has every certainty of a %s", (_what, facts) => {
    expect([...new Set(facts.map(({ certainty }) => certainty))].sort()).toEqual([
      "confirmed",
      "contradiction",
      "hypothesis",
      "one-source",
      "unresolved",
    ]);
  });

  it("has places whose names and affiliations changed", () => {
    expect(family.places.some(({ names }) => names.filter((n) => n.from !== null).length > 1)).toBe(
      true,
    );
    expect(family.places.some(({ affiliations }) => affiliations.length > 2)).toBe(true);
  });

  it.each(["birth", "death"])("has a second version of a %s", (kind) => {
    const second = family.events.find((event) => event.kind === kind && !event.main)!;
    const principal = second.participants[0]!.person;
    const versions = family.events.filter(
      (event) => event.kind === kind && event.participants[0]!.person === principal,
    );
    expect(versions.map(({ main }) => main)).toEqual([true, false]);
    expect(versions[0]!.date).not.toEqual(versions[1]!.date);
  });

  it("names no archive, fund or file", () => {
    expect(committed).not.toMatch(
      /НИАБ|НГАБ|ЛГИА|РГИА|ГАРФ|LVIA|AGAD|NIAB|фонд|опись|(?<!\p{L})(?:ф|оп|д|л)\. ?\d/iu,
    );
  });
});

describe("the hard cases", () => {
  const found = hardCases(family);
  const kin = kinOf(family);
  const linksOf = (id: string | undefined) => family.parentages.filter((l) => l.child === id);
  const sexOf = (id: string | null) => family.people.find((p) => p.id === id)?.sex;

  it("are all there", () => {
    const present = Object.entries(found).map(([name, list]) => [name, list.length > 0]);
    expect(Object.fromEntries(present)).toEqual({
      threeUnions: true,
      unknownParent: true,
      crossBranch: true,
      repeatedAncestor: true,
      adoption: true,
      relativeOfSpouse: true,
      descendantOfSpouse: true,
      parentVersions: true,
      unparsedDate: true,
      noBranch: true,
      childlessRow: true,
      unnamed: true,
      noKin: true,
    });
  });

  it("are not found where they are not", () => {
    const people = family.people.map((person) => ({ ...person, branch: "b1" }));
    const bare = { ...family, people, parentages: [], unions: [], events: [] };
    const { noKin, unnamed, ...rest } = hardCases(bare);
    expect(Object.values(rest).flat()).toEqual([]);
    expect(noKin).toHaveLength(300);
    expect(unnamed).toEqual(found.unnamed);
  });

  it("three unions: children in each, so there are half-siblings", () => {
    const others = found.threeUnions.map((person) => {
      const parents = kin.children(person).flatMap(kin.parents);
      return new Set(parents.filter((id) => id !== person)).size;
    });
    expect(Math.max(...others)).toBeGreaterThanOrEqual(3);
  });

  it("an unknown parent: the other parent is known and is nobody's partner", () => {
    const links = found.unknownParent.map((id) => family.parentages.find((l) => l.id === id)!);
    const known = links.flatMap(({ child }) => kin.parents(child));
    expect(known).toHaveLength(links.length);
    expect(known.flatMap(kin.partners)).toEqual([]);
  });

  it("a marriage across branches: with a child", () => {
    const couples = found.crossBranch.map((id) => family.unions.find((u) => u.id === id)!.partners);
    const both = couples.filter(([a, b]) =>
      kin.children(a).some((c) => kin.parents(c).includes(b)),
    );
    expect(both).not.toEqual([]);
  });

  it("an adoption: two adoptive parents next to the two blood ones", () => {
    const kinds = linksOf(found.adoption[0]).map(({ kind }) => kind);
    expect(kinds.sort()).toEqual(["adoption", "adoption", "blood", "blood"]);
  });

  it("two versions of a parent: the same sex, one of them main", () => {
    const links = linksOf(found.parentVersions[0]).filter(({ kind }) => kind === "blood");
    const fathers = links.filter(({ parent }) => sexOf(parent) === "male");
    expect(fathers.map(({ main }) => main).sort()).toEqual([false, true]);
  });

  it("an unparsed date: the text of the source stays", () => {
    const events = family.events.filter(({ id }) => found.unparsedDate.includes(id));
    expect(events.every(({ date }) => date!.text.length > 0)).toBe(true);
  });

  it("a childless row: eight siblings", () => {
    expect(found.childlessRow).toHaveLength(8);
  });

  it("a person with no branch and no kin: takes part in an event", () => {
    const friends = found.noKin.filter((id) => found.noBranch.includes(id));
    const guests = family.events.flatMap(({ participants }) => participants.slice(1));
    expect(guests.map(({ person }) => person)).toEqual(expect.arrayContaining(friends));
    expect(friends).not.toEqual([]);
  });

  it("a person nobody named: no guess at the name or the sex", () => {
    expect(found.unnamed.map(sexOf)).toEqual(["unknown"]);
  });
});

describe("the soundness check", () => {
  it("accepts the family", () => {
    expect(problems(family)).toEqual([]);
  });

  type Family = typeof family;
  const exactBirth = (f: Family) =>
    f.events.find((e) => e.kind === "birth" && e.date?.parsed?.qualifier === "exact")!;

  const exactDeaths = (f: Family) =>
    f.events.flatMap((e) => (e.kind === "death" && e.main && e.date?.parsed?.from) || []);
  const shiftBirths = (f: Family, sex: string, years: number) => {
    const ids = f.people.filter((p) => p.sex === sex).map(({ id }) => id);
    for (const { kind, date, participants } of f.events) {
      if (kind === "birth" && ids.includes(participants[0]!.person) && date?.parsed) {
        date.parsed.from.year += years;
      }
    }
  };
  const inviteEmigrant = (f: Family) => {
    const exact = (kind: string) =>
      f.events.find((e) => e.kind === kind && e.date?.parsed?.qualifier === "exact")!;
    const [left, wedding] = [exact("emigration"), exact("wedding")];
    wedding.participants.push({ person: left.participants[0]!.person, role: "witness" });
    wedding.date!.parsed!.from.year = left.date!.parsed!.from.year + 1;
  };
  const guestsAt = (f: Family, kind: string) =>
    f.events.filter((e) => e.kind === kind && e.participants.length > 2);

  it.each<[string, (broken: Family) => void, RegExp]>([
    [
      "a union with oneself",
      (f) => (f.unions[0]!.partners[1] = f.unions[0]!.partners[0]),
      /oneself/,
    ],
    [
      "a guest twice",
      (f) =>
        guestsAt(f, "baptism")[0]!.participants.push(
          f.events[0]!.participants[0]!,
          f.events[0]!.participants[0]!,
        ),
      /somebody twice/,
    ],
    [
      "an empty name",
      (f) => Object.assign(f.people[0]!.names[0]!, { given: null, surname: null }),
      /empty name/,
    ],
    [
      "a name shown in another language",
      (f) => (f.people[0]!.names[0]!.language = "be"),
      /not shown in ru/,
    ],
    ["a parent too young", (f) => shiftBirths(f, "male", 15), /is \d+ when/],
    ["a mother too old", (f) => shiftBirths(f, "female", -25), /is \d+ when/],
    ["a life too long", (f) => exactDeaths(f).forEach((d) => (d.year += 200)), /lived from/],
    [
      "a death before a child",
      (f) =>
        f.events.forEach(
          (e) => e.kind === "death" && e.date?.parsed && (e.date.parsed.from.year -= 40),
        ),
      /is dead when/,
    ],
    [
      "a guest not born yet",
      (f) =>
        f.events.forEach(
          (e) => e.kind === "wedding" && e.date?.parsed && (e.date.parsed.from.year -= 60),
        ),
      /is not born before/,
    ],
    [
      "a guest dead by then",
      (f) =>
        f.events.forEach(
          (e) => e.kind === "wedding" && e.date?.parsed && (e.date.parsed.from.year += 90),
        ),
      /is dead before/,
    ],
    ["a guest overseas", inviteEmigrant, /is overseas before/],
    [
      "a parent as godparent",
      (f) => {
        const e = guestsAt(f, "baptism").find(
          (x) => kinOf(f).parents(x.participants[0]!.person).length > 0,
        )!;
        e.participants[1]!.person = kinOf(f).parents(e.participants[0]!.person)[0]!;
      },
      /own godparent/,
    ],
    ["two godfathers", (f) => f.people.forEach((p) => (p.sex = "male")), /of one sex/],
    [
      "twelve months between two births",
      (f) => {
        const kin = kinOf(f);
        for (const p of f.people)
          for (const c of kin.children(p.id))
            for (const e of f.events)
              if (e.kind === "birth" && e.participants[0]!.person === c && e.date?.parsed)
                e.date.parsed.from.year = 1900;
      },
      /too close/,
    ],
    ["a cycle", (f) => (f.parentages[0]!.parent = f.parentages[0]!.child), /cycle/],
    ["a child that is not there", (f) => (f.parentages[0]!.child = "p0"), /refers to p0/],
    ["a place that is not there", (f) => (f.events[0]!.place = "pl0"), /refers to pl0/],
    ["a source that is not there", (f) => (f.citations[0]!.source = "s0"), /refers to s0/],
    ["a fact that is not there", (f) => (f.citations[0]!.fact = "x"), /refers to x/],
    ["a fact sure of itself", (f) => (f.citations.length = 0), /without a citation/],
    ["an id used twice", (f) => (f.people[1]!.id = f.people[0]!.id), /used twice/],
    ["an event about nobody", (f) => (f.events[0]!.participants.length = 0), /about nobody/],
    ["a dead person who lives", (f) => f.people.forEach((p) => (p.living = "yes")), /is dead/],
    [
      "a third main blood parent",
      (f) => f.parentages.forEach((l) => ((l.main = true), (l.kind = "blood"))),
      /main blood parents/,
    ],
    [
      "a birth in the future",
      (f) => (exactBirth(f).date!.parsed!.from.year = 2100),
      /born in 2100/,
    ],
  ])("notices %s", (_what, breakIt, expected) => {
    const broken = structuredClone(family);
    breakIt(broken);
    expect(problems(broken).join("\n")).toMatch(expected);
  });
});
