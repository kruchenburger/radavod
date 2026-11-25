import { describe, expect, it } from "vitest";
import { journalOver, sqliteJournal } from "../../src/contexts/history";
import { sqliteKinship } from "../../src/contexts/kinship";
import type { LifeEvent } from "../../src/contexts/life";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import { missing } from "../../src/kernel/refusal";
import { removePlace } from "../../src/scenarios/remove-place";
import { FamilyTree } from "../../src/worker/family-tree";
import {
  accepted,
  addBranch,
  addParent,
  addPerson,
  addUnion,
  anna,
  branch,
  citation,
  event,
  form,
  inNamed,
  inTree,
  parentage,
  person,
  place,
  source,
  union,
} from "./tree";

const birth = (who: string, more: Partial<LifeEvent> = {}): LifeEvent => ({
  id: event(`birth ${who}`.slice(0, 11)),
  kind: "birth",
  title: "",
  date: parseFuzzyDate("1885"),
  place: null,
  participants: [{ person: person(who), role: "principal" }],
  union: null,
  main: true,
  certainty: "hypothesis",
  note: "",
  ...more,
});

describe("a scenario", () => {
  it("that touches several contexts is one entry of the journal", () =>
    inTree((tree) => {
      const changed = tree.do((c) => {
        addPerson(c, "ada");
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
        accepted(c.life.add(birth("ada", { place: place("town") })));
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("c"),
            source: source("book"),
            fact: { subject: person("ada"), fact: `event:${event("birth ada")}` },
            page: "",
            quote: "",
          }),
        );
      });
      expect(changed).toEqual(
        [
          `person/${person("ada")}`,
          `place/${place("town")}`,
          `source/${source("book")}`,
          `cited/${person("ada")}`,
          `life/${person("ada")}`,
        ].map((aggregate) => ({ aggregate, version: 1 })),
      );
      expect(tree.entries).toBe(1);
      expect(tree.read((c) => c.kinship.get(person("ada"))?.version)).toBe(1);
      expect(tree.rows().history_subject).toHaveLength(3);
    }));

  it("that is refused leaves no row and no entry, whatever came before the refusal", () =>
    inTree((tree) => {
      const before = tree.rows();
      const result = tree.run((c) => {
        addPerson(c, "ada");
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
        return missing("somebody");
      });
      expect(result).toEqual({ ok: false, error: { code: "missing", id: "somebody" } });
      // What a scenario answers is given back as it is, a list too.
      expect(tree.run(() => ({ ok: true, value: [1, 2] }))).toEqual({
        ok: true,
        value: { value: [1, 2], changed: [] },
      });
      expect(tree.rows()).toEqual(before);
    }));

  it("that throws leaves nothing either", () =>
    inTree((tree) => {
      const before = tree.rows();
      expect(() =>
        tree.do((c) => {
          addPerson(c, "ada");
          throw new Error("broken");
        }),
      ).toThrow("broken");
      expect(tree.rows()).toEqual(before);
    }));

  it("does not run inside another: it would not see what that one did", () =>
    inTree((tree) => {
      const before = tree.rows();
      const inner = () => tree.do((c) => addPerson(c, "eve"));
      expect(() => tree.do(inner)).toThrow("nested-scenario");
      expect(() => tree.do(() => tree.read((c) => c.kinship.get(person("ada"))))).toThrow(
        "nested-scenario",
      );
      expect(tree.rows()).toEqual(before);
      inner();
      expect(tree.entries).toBe(1);
    }));

  it("is found by everybody it ever tied to somebody, what came after by the aggregate", () =>
    inTree((tree) => {
      const journal = journalOver(sqliteJournal(tree.storage.sql));
      tree.do((c) => {
        for (const who of ["ada", "eve", "kid"]) addPerson(c, who);
      });
      const guest = birth("eve", {
        participants: [
          { person: person("eve"), role: "principal" },
          { person: person("ada"), role: "guest" },
        ],
      });
      tree.do((c) => accepted(c.life.add(guest)));
      tree.do((c) => accepted(c.life.edit(person("eve"), { ...guest, note: "пришла поздно" })));
      tree.do((c) => accepted(c.life.remove(person("eve"), guest.id)));
      tree.do((c) => addUnion(c, "u", "ada", "eve"));
      const kind = { do: "edit-union", id: union("u"), patch: { kind: "civil" } } as const;
      tree.do((c) => accepted(c.kinship.apply(kind)));
      tree.do((c) => accepted(c.kinship.apply({ do: "remove-union", id: union("u") })));
      tree.do((c) => addParent(c, "kid", "ada"));
      tree.do((c) => addParent(c, "kid", "eve"));
      tree.do((c) => addParent(c, "ada", "eve"));
      const order = (...order: string[]) => ({
        do: "order-children" as const,
        person: person("eve"),
        order: order.map(person),
      });
      tree.do((c) => accepted(c.kinship.apply(order("ada", "kid"))));
      // She stays in the list, so this is found by her parent.
      tree.do((c) => accepted(c.kinship.apply(order("kid", "ada"))));
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "remove-parent", child: person("kid"), id: "ada" })),
      );

      const named = journal.entriesOf(person("ada"));
      const all = Array.from({ length: tree.entries }, (_, i) => i + 1);
      const says = all.filter((n) => JSON.stringify(journal.entry(n)).includes(person("ada")));
      // The note of an event, the kind of a union, and a new order of the same children.
      expect(all.filter((n) => !named.includes(n))).toEqual([3, 6, 9, 12]);
      // Everything an entry of hers is about or names, and all that was said of those.
      const patches = JSON.stringify(named.map((n) => journal.entry(n)?.patches));
      const around = [...patches.matchAll(/(?:person|union)_\w{22}/g)].flatMap(([id]) =>
        journal.entriesOf(id),
      );
      expect(says.filter((n) => !around.includes(n))).toEqual([]);
      expect([...new Set(around)].sort((a, b) => a - b)).toEqual(all);
    }));

  it("cannot change what it read behind the journal", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      expect(() => tree.do((c) => c.kinship.get(person("ada"))?.names.push(form("n2")))).toThrow(
        TypeError,
      );
      expect(() =>
        tree.do((c) => {
          const name = form("n2");
          accepted(c.kinship.apply({ do: "put-name", person: person("ada"), name }));
          name.given = "другое";
        }),
      ).toThrow(TypeError);
      expect(tree.entries).toBe(1);
    }));

  it("that changes nothing writes no entry", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      const before = tree.rows();
      const changed = tree.do((c) => {
        c.kinship.apply({ do: "edit-person", id: person("ada"), patch: { sex: "female" } });
        c.kinship.apply({ do: "edit-person", id: person("ada"), patch: { sex: "unknown" } });
      });
      expect(changed).toEqual([]);
      expect(tree.rows()).toEqual(before);
    }));

  it("merges its commands: the first before, the last after, one version", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => {
        for (const sex of ["female", "male", "other"] as const) {
          c.kinship.apply({ do: "edit-person", id: person("ada"), patch: { sex } });
        }
      });
      expect(tree.read((c) => c.kinship.get(person("ada"))?.version)).toBe(2);
      const [, row] = tree.rows().history_entry as { data: string }[];
      const entry = JSON.parse(row?.data ?? "");
      expect(entry).toEqual({
        at: 1_800_000_000_000,
        by: anna,
        scenario: "test",
        patches: [
          { aggregate: `person/${person("ada")}`, path: "sex", before: "unknown", after: "other" },
        ],
      });
    }));

  it("writes only what changed, whatever it read", () =>
    inTree((tree) => {
      tree.do((c) => {
        for (const who of ["ada", "eve", "kid"]) addPerson(c, who);
        addParent(c, "kid", "eve");
      });
      const { written } = tree.count(() =>
        tree.do((c) => {
          for (const who of ["eve", "kid"]) c.kinship.relatives(person(who));
          c.kinship.apply({ do: "edit-person", id: person("ada"), patch: { sex: "female" } });
        }),
      );
      // The person, the entry, and where it is found.
      expect(written).toBe(3);
      expect(tree.count(() => tree.read((c) => c.kinship.get(person("ada"))))).toMatchObject({
        written: 0,
      });
    }));

  it("sees what its own commands did", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "eve");
        addParent(c, "ada", "eve");
        expect(c.kinship.get(person("eve"))?.children).toEqual([person("ada")]);
        expect(
          c.kinship.apply({
            do: "add-parent",
            child: person("eve"),
            parentage: parentage("ada"),
          }),
        ).toMatchObject({ error: { code: "cycle" } });
      });
      expect(tree.read((c) => c.kinship.get(person("eve"))?.children)).toEqual([person("ada")]);
    }));
});

describe("a version", () => {
  it("that is not the one the editor saw is refused and named", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      const aggregate = `person/${person("ada")}`;
      tree.do(
        (c) => c.kinship.apply({ do: "edit-person", id: person("ada"), patch: { sex: "female" } }),
        { expected: { [aggregate]: 1 } },
      );
      const before = tree.rows();
      let ran = false;
      const result = tree.run(
        (c) => {
          ran = true;
          return c.kinship.apply({ do: "edit-person", id: person("ada"), patch: { sex: "male" } });
        },
        { expected: { [aggregate]: 1 } },
      );
      expect(result).toEqual({
        ok: false,
        error: { code: "stale-version", aggregate, current: 2 },
      });
      expect(ran).toBe(false);
      expect(tree.rows()).toEqual(before);
    }));

  it("is told of every kind of aggregate, 0 of one that is not there", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "eve");
        addUnion(c, "u", "ada", "eve");
        addBranch(c, "green");
        accepted(c.life.add(birth("ada")));
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("c"),
            source: source("book"),
            fact: { subject: union("u"), fact: "union" },
            page: "",
            quote: "",
          }),
        );
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
      });
      const there = {
        [`person/${person("ada")}`]: 1,
        [`union/${union("u")}`]: 1,
        [`branch/${branch("green")}`]: 1,
        [`life/${person("ada")}`]: 1,
        [`source/${source("book")}`]: 1,
        [`cited/${union("u")}`]: 1,
        [`place/${place("town")}`]: 1,
        [`person-branch/${person("ada")}`]: null,
        [`union-branch/${union("u")}`]: null,
        [`person/${person("nobody")}`]: 0,
        [`life/${person("nobody")}`]: 0,
      };
      expect(tree.do(() => {}, { expected: there })).toEqual([]);
      for (const aggregate of Object.keys(there)) {
        const result = tree.run(() => ({ ok: true, value: {} }), {
          expected: { [aggregate]: 7 },
        });
        expect(result).toMatchObject({
          error: { code: "stale-version", aggregate, current: there[aggregate] },
        });
      }
      for (const wrong of [
        "horse/1",
        "person",
        `person/${person("ada")}/x`,
        "person/zzz",
        "",
        `person/${union("u")}`,
        `place/${person("ada")}`,
        `life/${union("u")}`,
        `cited/${place("town")}`,
        `union-branch/${person("ada")}`,
      ]) {
        expect(() => tree.do(() => {}, { expected: { [wrong]: 0 } })).toThrow(
          /^unknown-aggregate$/,
        );
      }
    }));

  it("never comes back for an identifier that was there before", () =>
    inTree((tree) => {
      const versions: (number | undefined)[] = [];
      const version = () => tree.read((c) => c.kinship.union(union("u"))?.version);
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "eve");
      });
      for (let i = 0; i < 3; i++) {
        tree.do((c) => addUnion(c, "u", "ada", "eve"));
        versions.push(version());
        tree.do((c) => accepted(c.kinship.apply({ do: "remove-union", id: union("u") })));
        expect(version()).toBeUndefined();
      }
      expect(versions).toEqual([2, 4, 6]);
    }));

  it("does not go on when only a mirror changes", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "eve");
      });
      const changed = tree.do((c) => {
        addParent(c, "ada", "eve");
        addUnion(c, "u", "ada", "eve");
        accepted(
          c.life.add(
            birth("ada", {
              participants: [
                { person: person("ada"), role: "principal" },
                { person: person("eve"), role: "mother" },
              ],
            }),
          ),
        );
      });
      expect(changed.map(({ aggregate }) => aggregate)).toEqual([
        `person/${person("ada")}`,
        `union/${union("u")}`,
        `life/${person("ada")}`,
      ]);
      const [kin, born] = tree.read((c) => [
        c.kinship.get(person("eve")),
        c.life.eventsOf(person("eve")),
      ]);
      expect(kin).toMatchObject({ version: 1, children: [person("ada")], unions: [union("u")] });
      expect(born).toHaveLength(1);
      // An open form of hers goes through.
      tree.do(
        (c) => c.kinship.apply({ do: "edit-person", id: person("eve"), patch: { sex: "female" } }),
        {
          expected: { [`person/${person("eve")}`]: 1, [`life/${person("eve")}`]: 0 },
        },
      );
    }));

  it("of two editors who add the second parent at once lets one through, and nothing is lost", async () => {
    const name = `race ${crypto.randomUUID()}`;
    await inNamed(name, (tree) => {
      tree.do((c) => {
        for (const who of ["child", "a", "b", "c"]) addPerson(c, who);
        addParent(c, "child", "a");
      });
    });
    const expected = { [`person/${person("child")}`]: 1 };
    const add = (parent: string) =>
      inNamed(name, (tree) =>
        tree.run(
          (c) =>
            c.kinship.apply({
              do: "add-parent",
              child: person("child"),
              parentage: parentage(parent),
            }),
          { expected },
        ),
      );
    const results = await Promise.all([add("b"), add("c")]);
    expect(results.filter(({ ok }) => ok)).toHaveLength(1);
    expect(results.find(({ ok }) => !ok)).toEqual({
      ok: false,
      error: { code: "stale-version", aggregate: `person/${person("child")}`, current: 2 },
    });
    await inNamed(name, (tree) => {
      const parents = tree.read((c) => c.kinship.get(person("child"))?.parents) ?? [];
      expect(parents).toHaveLength(2);
      expect(parents.every(({ main }) => main)).toBe(true);
      expect(tree.entries).toBe(2);
    });
  });
});

describe("a branch", () => {
  const start = (tree: Parameters<Parameters<typeof inTree>[0]>[0]) =>
    tree.do((c) => {
      addPerson(c, "ada");
      addPerson(c, "eve");
      addUnion(c, "u", "ada", "eve");
      addBranch(c, "green");
      addBranch(c, "red");
    });
  const give = (to: string | null) => ({
    do: "assign-branch" as const,
    person: person("ada"),
    branch: to === null ? null : branch(to),
    descendants: false,
    overwrite: false,
  });

  it("is kept with the branch, and makes no version of the person", () =>
    inTree((tree) => {
      start(tree);
      const changed = tree.do((c) => accepted(c.kinship.apply(give("green"))));
      expect(changed).toEqual([{ aggregate: `person-branch/${person("ada")}`, version: 2 }]);
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "edit-union",
            id: union("u"),
            patch: { branch: branch("green") },
          }),
        ),
      );
      const [ada, couple, green] = tree.read((c) => [
        c.kinship.get(person("ada")),
        c.kinship.union(union("u")),
        c.kinship.branch(branch("green")),
      ]);
      expect(ada).toMatchObject({ version: 1, branch: branch("green") });
      expect(couple).toMatchObject({ version: 1, branch: branch("green") });
      expect(green).toMatchObject({ version: 1 });
      tree.do((c) => accepted(c.kinship.apply(give("red"))));
      tree.do((c) => accepted(c.kinship.apply(give(null))));
      expect(tree.read((c) => c.kinship.get(person("ada"))?.branch)).toBeNull();
      expect(tree.read((c) => c.kinship.union(union("u"))?.branch)).toBe(branch("green"));
    }));

  it("given by two editors at once is given by the first", () =>
    inTree((tree) => {
      start(tree);
      const aggregate = `person-branch/${person("ada")}`;
      const expected = { [aggregate]: null };
      tree.do((c) => accepted(c.kinship.apply(give("green"))), { expected });
      expect(tree.run((c) => c.kinship.apply(give("red")), { expected })).toEqual({
        ok: false,
        error: { code: "stale-version", aggregate, current: branch("green") },
      });
    }));

  it("is found in the journal under both branches, not under the person", () =>
    inTree((tree) => {
      start(tree);
      tree.do((c) => accepted(c.kinship.apply(give("green"))));
      tree.do((c) => accepted(c.kinship.apply(give("red"))));
      const entries = Object.fromEntries(
        (tree.rows().history_subject as { id: string; entries: string }[]).map((row) => [
          row.id,
          JSON.parse(row.entries),
        ]),
      );
      expect(entries).toMatchObject({
        [branch("green")]: [1, 2, 3],
        [branch("red")]: [1, 3],
        [person("ada")]: [1],
      });
    }));

  it("that is removed is gone from its people and unions in one entry", () =>
    inTree((tree) => {
      start(tree);
      tree.do((c) => {
        accepted(c.kinship.apply(give("green")));
        accepted(
          c.kinship.apply({ do: "edit-union", id: union("u"), patch: { branch: branch("green") } }),
        );
      });
      const changed = tree.do((c) =>
        accepted(c.kinship.apply({ do: "remove-branch", id: branch("green") })),
      );
      expect(changed.map(({ aggregate }) => aggregate)).toEqual([
        `branch/${branch("green")}`,
        `person-branch/${person("ada")}`,
        `union-branch/${union("u")}`,
      ]);
      expect(tree.read((c) => c.kinship.branch(branch("green")))).toBeNull();
      expect(tree.read((c) => c.kinship.get(person("ada"))?.branch)).toBeNull();
      expect(tree.rows().kinship_branch).toHaveLength(1);
    }));

  it("given twice in one scenario is one patch, and given back is none", () =>
    inTree((tree) => {
      start(tree);
      tree.do((c) => {
        accepted(c.kinship.apply(give("green")));
        accepted(c.kinship.apply(give("red")));
      });
      const [, row] = tree.rows().history_entry as { data: string }[];
      expect(JSON.parse(row?.data ?? "").patches).toEqual([
        {
          aggregate: `person-branch/${person("ada")}`,
          path: "",
          before: null,
          after: branch("red"),
        },
      ]);
      const before = tree.rows();
      const changed = tree.do((c) => {
        accepted(c.kinship.apply(give("green")));
        accepted(c.kinship.apply(give("red")));
      });
      expect(changed).toEqual([]);
      expect(tree.rows()).toEqual(before);
    }));

  it("that has no row takes nobody", () =>
    inTree((tree) => {
      start(tree);
      tree.storage.transactionSync(() => {
        const kinship = sqliteKinship(tree.storage.sql);
        kinship.save([
          { kind: "person-branch", id: person("ada"), before: null, after: branch("none") },
        ]);
        expect(() => kinship.flush(2)).toThrow("bad-write branch/");
      });
    }));

  it("that is new takes a member in the same scenario", () =>
    inTree((tree) => {
      start(tree);
      tree.do((c) => {
        addBranch(c, "blue");
        accepted(c.kinship.apply(give("blue")));
      });
      expect(tree.read((c) => c.kinship.get(person("ada"))?.branch)).toBe(branch("blue"));
    }));
});

describe("what a family writes", () => {
  it.each([
    "",
    "Ё".repeat(500),
    "Й и е́",
    "שנייבלאַט ‏",
    "👶🏽👩‍👩‍👧",
    "\ud800 alone",
    "\u0000\u0001\n\t\"'\\",
    "'); DROP TABLE kinship_person; --",
  ])("comes back as it was: %j", (text) =>
    inTree((tree) => {
      const name = form("n1", { given: text, patronymic: text, surname: text });
      const told = birth("ada", { title: text, note: text, date: parseFuzzyDate(text) });
      const cited = {
        id: citation("c"),
        source: source("book"),
        fact: { subject: person("ada"), fact: "name:n1" },
        page: text,
        quote: text,
      };
      const town = {
        id: place("town"),
        names: [{ text, language: "other" as const, period: null }],
        affiliations: [{ name: text, period: { from: parseFuzzyDate(text), to: null } }],
        coordinates: { lat: -90, lon: 180 },
      };
      const book = {
        id: source("book"),
        kind: "story" as const,
        title: text,
        repository: text,
        note: text,
      };
      tree.do((c) => {
        addPerson(c, "ada");
        accepted(c.kinship.apply({ do: "put-name", person: person("ada"), name }));
        accepted(c.life.add(told));
        accepted(c.evidence.addSource(book));
        accepted(c.evidence.cite(cited));
        accepted(c.places.add(town));
      });
      tree.read((c) => {
        expect(c.kinship.get(person("ada"))?.names).toEqual([name]);
        expect(c.life.event(person("ada"), told.id)).toEqual(told);
        expect(c.evidence.citationsOf(person("ada"))).toEqual([cited]);
        expect(c.evidence.source(source("book"))).toEqual({ ...book, version: 1 });
        expect(c.places.get(place("town"))).toEqual({ ...town, version: 1 });
      });
    }),
  );
});

describe("a row that is not what it should be", () => {
  const secret = "Тайное имя";

  it.each([
    ["kinship_person", `{"names":"${secret}"}`],
    ["kinship_person", secret],
    ["kinship_person", "null"],
  ])("in %s is named by its key and never quoted", (table, data) =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.storage.sql.exec(`UPDATE ${table} SET data = ?`, data);
      const read = () => tree.read((c) => c.kinship.get(person("ada")));
      expect(read).toThrow(`corrupt-row person/${person("ada")}`);
      try {
        read();
      } catch (error) {
        expect(error).toMatchObject({ code: "corrupt-row", key: `person/${person("ada")}` });
        expect(String((error as Error).stack)).not.toContain(secret);
        expect((error as Error).cause).toBeUndefined();
      }
    }),
  );

  it("is found in every table", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "eve");
        addUnion(c, "u", "ada", "eve");
        addBranch(c, "green");
        accepted(c.life.add(birth("ada")));
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("c"),
            source: source("book"),
            fact: { subject: union("u"), fact: "union" },
            page: "",
            quote: "",
          }),
        );
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
      });
      const reads: [string, string, () => unknown][] = [
        ["kinship_union", "union", () => tree.read((c) => c.kinship.union(union("u")))],
        ["kinship_branch", "branch", () => tree.read((c) => c.kinship.branch(branch("green")))],
        ["life_subject", "life", () => tree.read((c) => c.life.eventsOf(person("ada")))],
        ["evidence_source", "source", () => tree.read((c) => c.evidence.source(source("book")))],
        ["evidence_subject", "cited", () => tree.read((c) => c.evidence.citationsOf(union("u")))],
        ["places_place", "place", () => tree.read((c) => c.places.get(place("town")))],
        ["kinship_person", "person", () => tree.read((c) => c.kinship.get(person("ada")))],
      ];
      for (const [table, kind, read] of reads) {
        const [row] = tree.storage.sql
          .exec<{ data: string }>(`SELECT data FROM ${table} LIMIT 1`)
          .toArray();
        const right = row?.data ?? "";
        // An unknown field is not let through either.
        tree.storage.sql.exec(`UPDATE ${table} SET data = ?`, `{"extra":1,${right.slice(1)}`);
        expect(read, table).toThrow(`corrupt-row ${kind}/`);
        tree.storage.sql.exec(`UPDATE ${table} SET data = ?, version = -1`, right);
        expect(read, table).toThrow(`corrupt-row ${kind}/`);
        tree.storage.sql.exec(`UPDATE ${table} SET version = 1`);
      }
      tree.storage.sql.exec(`UPDATE kinship_branch SET members = '{"people":["x"],"unions":[]}'`);
      expect(() => tree.read((c) => c.kinship.get(person("ada")))).toThrow("corrupt-row branch/");
      // Nobody is in two branches.
      tree.storage.sql.exec(`UPDATE kinship_branch SET members = '{"people":[],"unions":[]}'`);
      tree.do((c) => addBranch(c, "red"));
      const members = JSON.stringify({ people: [person("ada")], unions: [] });
      tree.storage.sql.exec("UPDATE kinship_branch SET members = ?", members);
      expect(() => tree.read((c) => c.kinship.get(person("ada")))).toThrow("corrupt-row branch/");
    }));

  it("is not written either", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      const before = tree.rows();
      expect(() =>
        tree.do((c) =>
          c.kinship.apply({
            do: "put-name",
            person: person("ada"),
            name: { ...form("n1"), given: 7 as unknown as string },
          }),
        ),
      ).toThrow(`bad-write person/${person("ada")}`);
      expect(() =>
        tree.do((c) =>
          c.kinship.apply({ do: "put-name", person: person("ada"), name: form("a/b") }),
        ),
      ).toThrow("bad-write");
      expect(tree.rows()).toEqual(before);
    }));
});

describe("a row with nothing in it", () => {
  const guest = birth("ada", {
    participants: [
      { person: person("ada"), role: "principal" },
      { person: person("eve"), role: "mother" },
    ],
  });

  it("keeps the version its last editor was told", () =>
    inTree((tree) => {
      tree.do((c) => {
        for (const who of ["ada", "eve"]) addPerson(c, who);
        accepted(c.life.add(guest));
      });
      const aggregate = `life/${person("ada")}`;
      const changed = tree.do((c) => accepted(c.life.remove(person("ada"), guest.id)));
      expect(changed).toEqual([{ aggregate, version: 2 }]);
      tree.do((c) => accepted(c.life.add(birth("ada"))), { expected: { [aggregate]: 2 } });
      // A row nobody ever wrote anything in does not stay.
      expect(tree.rows().life_subject).toHaveLength(1);
    }));

  it("does not go stale by a mirror", () =>
    inTree((tree) => {
      tree.do((c) => {
        for (const who of ["ada", "eve"]) addPerson(c, who);
        accepted(c.life.add(guest));
      });
      const own = birth("eve");
      tree.do((c) => accepted(c.life.add(own)));
      tree.do((c) => accepted(c.life.remove(person("eve"), own.id)));
      const expected = { [`life/${person("eve")}`]: 3 };
      tree.do((c) => accepted(c.life.remove(person("ada"), guest.id)), { expected });
      tree.do((c) => accepted(c.life.add(own)), { expected });
    }));
});

describe("a place and a source", () => {
  it("in use are not removed, and it is told how often", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "eve");
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
        accepted(c.life.add(birth("ada", { place: place("town") })));
        accepted(c.life.add(birth("eve", { place: place("town") })));
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("c"),
            source: source("book"),
            fact: { subject: person("ada"), fact: "name:n1" },
            page: "",
            quote: "",
          }),
        );
        accepted(
          c.evidence.addSource({
            id: source("story"),
            kind: "story",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("d"),
            source: source("story"),
            fact: { subject: person("ada"), fact: "name:n1" },
            page: "",
            quote: "",
          }),
        );
      });
      const drop = () => tree.run((c) => removePlace(c, place("town")));
      expect(drop()).toEqual({ ok: false, error: { code: "in-use", count: 2 } });
      expect(tree.run((c) => c.evidence.removeSource(source("book")))).toEqual({
        ok: false,
        error: { code: "in-use", count: 1 },
      });
      // What the same scenario changes counts.
      const result = tree.run((c) => {
        accepted(c.life.remove(person("ada"), birth("ada").id));
        accepted(c.life.edit(person("eve"), birth("eve")));
        accepted(c.evidence.uncite({ subject: person("ada"), fact: "name:n1" }, citation("c")));
        accepted(c.evidence.removeSource(source("book")));
        return removePlace(c, place("town"));
      });
      expect(result.ok).toBe(true);
      expect(tree.rows()).toMatchObject({ places_place: [], evidence_source: [{}] });
      expect(drop()).toEqual({ ok: false, error: { code: "missing", id: place("town") } });
    }));
});

describe("the object", () => {
  it("has no method for the outside but a ping", () => {
    expect(Object.getOwnPropertyNames(FamilyTree.prototype)).toEqual(["constructor", "ping"]);
  });
});
