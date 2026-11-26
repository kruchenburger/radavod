import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { factOf } from "../../src/contexts/life";
import type { Id, PersonId } from "../../src/kernel/id";
import { importTable, type NewId } from "../../src/scenarios/import-table";
import { restore, trash } from "../../src/scenarios/trash";
import { undo } from "../../src/scenarios/undo";
import { snapshotOf } from "../../src/shared/snapshot";
import family from "../exchange/family-table.csv?raw";
import { csv } from "../exchange/tables";
import { accepted, addPerson, anna, idOf, inTree, person, type Tree } from "../storage/tree";

/** Identifiers that say the order they were made in. */
function counting(): NewId {
  let made = 0;
  return <K extends string>(kind: K) => {
    made += 1;
    return idOf(kind, `n${made}`) as Id<K>;
  };
}

const imported = (tree: Tree, text = family) =>
  accepted(tree.run((c) => importTable(c, text, counting()), { scenario: "import-table" }));

/** Everybody in the tree, by the name they are shown by. */
function namesIn(tree: Tree): Map<string, PersonId> {
  const state = tree.read((c) => c.history.state());
  const people = Object.keys(state).filter((key) => key.startsWith("person/"));
  return new Map(
    people.map((key) => {
      const id = key.slice("person/".length) as PersonId;
      const person = tree.read((c) => c.kinship.get(id));
      const [name] = person?.names ?? [];
      return [`${name?.given ?? ""} ${name?.surname ?? ""}`, id];
    }),
  );
}

describe("importing a family table", () => {
  it("adds everybody with names, parents, couples, births, deaths and sources in one entry", () =>
    inTree((tree) => {
      const { value } = imported(tree);
      expect(tree.entries).toBe(1);
      expect(tree.read((c) => c.history.entry(1)?.scenario)).toBe("import-table");
      const named = namesIn(tree);
      expect(named.size).toBe(value.people.length);

      const viktar = named.get("Віктар Лазовік") as PersonId;
      const child = tree.read((c) => c.kinship.get(named.get("Дзмітрый Лазовік") as PersonId));
      expect(child?.parents.map(({ parent }) => parent)).toEqual([
        viktar,
        named.get("Святлана Лазовік"),
      ]);
      expect(
        child?.parents.every(({ union, kind, main }) => union !== null && kind === "blood" && main),
      ).toBe(true);
      const union = tree.read((c) => c.kinship.union(child?.parents[0]?.union ?? ("" as never)));
      expect(union).toMatchObject({ kind: "marriage", certainty: "hypothesis" });

      const symon = named.get("Сымон Лазовік") as PersonId;
      expect(tree.read((c) => c.kinship.get(symon))?.living).toBe("no");
      const death = tree.read((c) => c.life.main(symon, "death"));
      expect(death?.date?.parsed?.from).toEqual({ year: 1961, month: 5, day: 14 });
      expect(tree.read((c) => c.life.main(symon, "birth"))?.date?.text).toBe("12 Март 1898");

      // One source for a link, cited at the name of each who has it.
      const cited = tree.read((c) => c.evidence.citationsOf(viktar));
      expect(cited).toHaveLength(1);
      const yauhen = named.get("Яўген Сідарэвіч") as PersonId;
      const theirs = tree.read((c) => c.evidence.citationsOf(yauhen));
      expect(theirs[0]?.source).toBe(cited[0]?.source);
      expect(tree.read((c) => c.evidence.source(cited[0]?.source ?? ("" as never)))).toMatchObject({
        kind: "site",
        title: "https://example.org/lazovik/viktar",
      });
      // A link stands behind nothing it does not say: the name stays a hypothesis.
      expect(tree.read((c) => c.kinship.get(viktar))?.names[0]?.certainty).toBe("hypothesis");

      // What the snapshot of the tree shows of it.
      const snapshot = snapshotOf(
        tree.read((c) => c.history.state()),
        { version: 1, epoch: "e" },
      );
      expect(snapshot.people).toHaveLength(44);
    }));

  it("is told the same as a preview, and a preview writes nothing", () =>
    inTree((tree) => {
      const preview = accepted(tree.work.preview((c) => importTable(c, family, counting())));
      expect(tree.entries).toBe(0);
      expect(tree.read((c) => c.kinship.someone())).toBe(false);
      expect(imported(tree).value).toEqual(preview);
    }));

  it("goes only into a tree without people", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      expect(tree.run((c) => importTable(c, family, counting()))).toEqual({
        ok: false,
        error: { code: "tree-not-empty" },
      });
      expect(tree.entries).toBe(1);
    }));

  it("goes not into a tree whose people are in the trash, until they are back or gone", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      accepted(tree.run((c) => trash(c, person("ada"), { actor: anna, now: 5 })));
      expect(tree.read((c) => c.kinship.someone())).toBe(false);
      const refused = { ok: false, error: { code: "trash-not-empty" } };
      expect(tree.work.preview((c) => importTable(c, family, counting()))).toEqual(refused);
      expect(tree.run((c) => importTable(c, family, counting()))).toEqual(refused);
      accepted(tree.run((c) => restore(c, person("ada"))));
      expect(tree.run((c) => importTable(c, family, counting()))).toEqual({
        ok: false,
        error: { code: "tree-not-empty" },
      });
      expect(tree.entries).toBe(3);
    }));

  it("is undone as one edit, and leaves an empty tree", () =>
    inTree((tree) => {
      imported(tree);
      accepted(tree.run((c) => undo(c, 1)));
      expect(tree.read((c) => c.kinship.someone())).toBe(false);
      const state = tree.read((c) => c.history.state());
      expect(Object.keys(state).filter((key) => !key.startsWith("branch"))).toEqual([]);
      // And the table may come in again.
      imported(tree);
    }));

  it("refuses a table of nobody, and writes nothing", () =>
    inTree((tree) => {
      expect(tree.run((c) => importTable(c, ",,,\n", counting()))).toEqual({
        ok: false,
        error: { code: "empty-table" },
      });
      expect(tree.entries).toBe(0);
    }));

  it("keeps a date it could not read as written, as a fact of the person", () =>
    inTree((tree) => {
      imported(tree);
      const alena = namesIn(tree).get("Алена Лазовік") as PersonId;
      const birth = tree.read((c) => c.life.main(alena, "birth"));
      expect(birth?.date).toEqual({ text: "2 Янврь 1934", parsed: null });
      expect(factOf(birth ?? ({} as never)).subject).toBe(alena);
    }));

  it("leaves out a parent kinship refuses, says so, and adds the rest", () =>
    inTree((tree) => {
      const row = (name: string, father: string, mother = "") =>
        ["0", name, "", "", "м", "", "", "", "", "", "", "", "", father, mother].join(",");
      const text = [row("А", "2"), row("Б", "3"), row("В", "1"), row("Г", "4"), row("Д", "1", "1")];
      const { value } = imported(tree, text.join("\n"));
      expect(
        value.problems.filter(({ code }) => ["parent-cycle", "same-parent"].includes(code)),
      ).toEqual([
        { row: 3, code: "parent-cycle", parent: 1 },
        { row: 4, code: "parent-cycle", parent: 4 },
        { row: 5, code: "same-parent", parent: 1 },
      ]);
      // Rows 1, 2 and 5 have their father.
      expect(value.parents).toBe(3);
      expect(namesIn(tree).size).toBe(5);
    }));

  it("takes any table the parser reads, and says as many links to parents as it adds", () =>
    fc.assert(
      fc.asyncProperty(csv, (text) =>
        inTree((tree) => {
          const preview = tree.work.preview((c) => importTable(c, text, counting()));
          if (!preview.ok) {
            expect(["empty-table"]).toContain(preview.error.code);
            return;
          }
          const { value } = imported(tree, text);
          const state = tree.read((c) => c.history.state());
          const links = Object.entries(state)
            .filter(([key]) => key.startsWith("person/"))
            .flatMap(([, person]) => (person as { parents: unknown[] }).parents);
          expect(links.length).toBe(value.parents);
        }),
      ),
      { numRuns: 25 },
    ));
});
