import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Changed, journalOver, type Patch, sqliteJournal } from "../../src/contexts/history";
import { patchesOf } from "../../src/contexts/history/domain/entry";
import { anna, branch, inTree, person } from "./tree";

type Fields = Record<string, unknown>;
type Thing = Fields & { id: string };

/** Takes an aggregate back by its patches, as an undo will. */
function back(after: unknown, patches: Patch[]): unknown {
  let value = structuredClone(after) as Fields | null;
  for (const { path, before } of patches) {
    const [field = "", id, part] = path.split("/");
    if (path === "") value = before as Fields | null;
    else if (value === null) throw new Error("nothing to change");
    else if (id === undefined) value[field] = before;
    else if (id === "") {
      const order = before as string[];
      (value[field] as Thing[]).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    } else {
      const list = value[field] as Thing[];
      const at = list.findIndex((one) => one.id === id);
      if (part !== undefined) (list[at] as Thing)[part] = before;
      else if (before === null) list.splice(at, 1);
      else list.push(before as Thing);
    }
  }
  return value;
}

const thing = fc.record({
  id: fc.constantFrom("n1", "n2", "n3"),
  given: fc.constantFrom("Верес", "Дуб"),
  date: fc.option(fc.record({ year: fc.constantFrom(1885, 1886) }), { nil: null }),
});
const aggregate = fc.record({
  sex: fc.constantFrom("male", "female"),
  names: fc.uniqueArray(thing, { selector: ({ id }) => id }),
  childOrder: fc.uniqueArray(fc.constantFrom("a", "b")),
  title: fc.record({ ru: fc.constantFrom("", "x"), en: fc.constantFrom("", "y") }),
});
const maybe = fc.option(aggregate, { nil: null });

describe("patches", () => {
  const changed = (before: unknown, after: unknown): Changed => ({
    kind: "person",
    id: "p",
    before,
    after,
  });

  it("take what is after back to what was before", () => {
    fc.assert(
      fc.property(maybe, maybe, (before, after) => {
        fc.pre(before !== null || after !== null);
        const patches = patchesOf(changed(before, after));
        expect(back(after, patches)).toEqual(before);
        // Nothing is told that did not change.
        for (const patch of patches) expect(patch.before).not.toEqual(patch.after);
      }),
      { numRuns: 500 },
    );
  });

  it("are as small as a field of a thing", () => {
    const names = [
      { id: "n1", given: "Верес" },
      { id: "n2", given: "Дуб" },
    ];
    const paths = (before: unknown, after: unknown) =>
      patchesOf(changed(before, after)).map(({ path }) => path);
    expect(paths({ names }, { names: [{ id: "n1", given: "Вяз" }, names[1]] })).toEqual([
      "names/n1/given",
    ]);
    const third = { id: "n3", given: "Вяз" };
    // What is added at the end or removed from it needs no order.
    expect(paths({ names }, { names: [...names, third] })).toEqual(["names/n3"]);
    expect(paths({ names }, { names: [names[0]] })).toEqual(["names/n2"]);
    expect(paths({ names }, { names: [names[0], third] })).toEqual(["names/n2", "names/n3"]);
    expect(paths({ names }, { names: [third, ...names] })).toEqual(["names/n3", "names/"]);
    expect(paths({ names }, { names: [names[1]] })).toEqual(["names/n1", "names/"]);
    expect(paths({ names }, { names: names.toReversed() })).toEqual(["names/"]);
    expect(paths({ title: { ru: "", en: "" } }, { title: { ru: "x", en: "" } })).toEqual(["title"]);
    expect(paths({ order: [] }, { order: ["a"] })).toEqual(["order"]);
    expect(paths(null, { names })).toEqual([""]);
    expect(paths({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    expect(patchesOf(changed(null, { names }))[0]).toEqual({
      aggregate: "person/p",
      path: "",
      before: null,
      after: { names },
    });
  });
});

describe("the journal", () => {
  it("counts entries and finds them by subject", () =>
    inTree((tree) => {
      const journal = journalOver(sqliteJournal(tree.storage.sql));
      const act = { actor: anna, now: 5, scenario: "edit-person" };
      const edit = (id: string, after: unknown): Changed => ({
        kind: "person",
        id,
        before: { sex: "male" },
        after,
      });
      expect(journal.next()).toBe(1);
      journal.write(1, act, [edit("p", { sex: "female" }), { ...edit("p", null), kind: "life" }]);
      expect(journal.next()).toBe(2);
      journal.write(2, act, [edit("q", { sex: "female" }), edit("p", { sex: "other" })]);
      expect(journal.entriesOf("p")).toEqual([1, 2]);
      expect(journal.entriesOf("q")).toEqual([2]);
      expect(journal.entriesOf("r")).toEqual([]);
      expect(journal.entry(1)).toEqual({
        number: 1,
        at: 5,
        by: anna,
        scenario: "edit-person",
        patches: [
          { aggregate: "person/p", path: "sex", before: "male", after: "female" },
          { aggregate: "life/p", path: "", before: { sex: "male" }, after: null },
        ],
      });
      expect(journal.entry(3)).toBeNull();
    }));

  it("does not write over an entry", () =>
    inTree((tree) => {
      const journal = journalOver(sqliteJournal(tree.storage.sql));
      const act = { actor: anna, now: 5, scenario: "edit-person" };
      journal.write(1, act, []);
      expect(() => journal.write(1, act, [])).toThrow(/UNIQUE|PRIMARY/);
      // And what could not be read back is not written.
      expect(() => journal.write(2, { ...act, scenario: "" }, [])).toThrow(/^bad-write entry\/2$/);
      expect(() => journal.write(2, { ...act, actor: "anna" as typeof anna }, [])).toThrow(
        /^bad-write entry\/2$/,
      );
      expect(journal.next()).toBe(2);
    }));

  it("keeps an entry of any size", () =>
    inTree((tree) => {
      const journal = journalOver(sqliteJournal(tree.storage.sql));
      // Larger than a row of the database may be.
      const changed = Array.from({ length: 5000 }, (_, i) => ({
        kind: "person",
        id: `p${i}`,
        before: null,
        after: { note: "Ё".repeat(2000) },
      }));
      const act = { actor: anna, now: 5, scenario: "import" };
      journal.write(1, act, changed);
      expect(journal.next()).toBe(2);
      const entry = journal.entry(1);
      expect(entry).toMatchObject({ number: 1, at: 5, by: anna, scenario: "import" });
      expect(entry?.patches).toEqual(changed.flatMap(patchesOf));
      const parts = tree.storage.sql
        .exec<{ size: number }>("SELECT length(CAST(data AS BLOB)) AS size FROM history_entry")
        .toArray();
      expect(parts.length).toBeGreaterThan(10);
      expect(parts.length).toBeLessThan(40);
      expect(Math.max(...parts.map(({ size }) => size))).toBeLessThan(1_900_000);
    }));

  it("finds an entry by everybody it names", () =>
    inTree((tree) => {
      const journal = journalOver(sqliteJournal(tree.storage.sql));
      const act = { actor: anna, now: 5, scenario: "s" };
      const [ada, eve, kid] = [person("ada"), person("eve"), person("kid")];
      journal.write(1, act, [
        {
          kind: "union",
          id: "u",
          before: { partners: [ada, "unknown"], kind: "civil" },
          after: { partners: [ada, eve], kind: "civil" },
        },
      ]);
      journal.write(2, act, [
        {
          kind: "person",
          id: kid,
          before: { parents: [{ id: "x", parent: eve }], sex: "male" },
          after: { parents: [], sex: "male" },
        },
      ]);
      // Whoever stays in a list is not told again, and what only looks like a person is a text.
      const list = (...people: string[]) => ({ childOrder: people, note: "" });
      journal.write(4, act, [
        { kind: "person", id: "p", before: list(ada, eve), after: list(eve, ada, kid) },
        { kind: "person", id: "q", before: list(), after: { ...list(), note: `${ada}, тайна` } },
      ]);
      journal.write(5, act, [
        { kind: "person", id: "p", before: list(), after: { ...list(), note: "person_ тайна" } },
      ]);
      expect(journal.entriesOf(kid)).toEqual([2, 4]);
      const subjects = tree.rows().history_subject as { id: string }[];
      expect(subjects.filter(({ id }) => id.includes("тайна"))).toEqual([]);
      // Hundreds may go from one branch to another at once: they are found under the branches.
      journal.write(3, act, [
        { kind: "person-branch", id: ada, before: null, after: branch("green") },
      ]);
      // Ada was in the union and stays in it.
      expect(journal.entriesOf(ada)).toEqual([]);
      expect(journal.entriesOf(eve)).toEqual([1, 2]);
      expect(journal.entriesOf("u")).toEqual([1]);
      expect(journal.entriesOf(branch("green"))).toEqual([3]);
    }));

  it("names a corrupt row and does not quote it", () =>
    inTree((tree) => {
      const journal = journalOver(sqliteJournal(tree.storage.sql));
      journal.write(1, { actor: anna, now: 5, scenario: "s" }, [
        { kind: "person", id: "p", before: null, after: {} },
      ]);
      tree.storage.sql.exec(`UPDATE history_entry SET data = '{"by":"Тайна"}'`);
      tree.storage.sql.exec(`UPDATE history_subject SET entries = 'Тайна'`);
      expect(() => journal.entry(1)).toThrow(/^corrupt-row entry\/1$/);
      expect(() => journal.entriesOf("p")).toThrow(/^corrupt-row subject\/p$/);
    }));
});
