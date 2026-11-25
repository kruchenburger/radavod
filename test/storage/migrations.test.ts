import { describe, expect, it } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { type Migration, migrate } from "../../src/contexts/history";
import type { BranchId, PersonId, PlaceId, SourceId, UnionId } from "../../src/kernel/id";
import { steps } from "../../src/worker/schema";
import { fill, type Row, rowsOf, tables } from "./schema-1";
import { accepted, inTree, person, type Tree } from "./tree";

/** The object has been through the steps already. */
function empty({ storage: { sql } }: Tree): void {
  const all = sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB '*_*' AND name NOT GLOB '_cf_*'",
    )
    .toArray();
  for (const { name } of all) sql.exec(`DROP TABLE ${name}`);
}

const schemaOf = ({ storage: { sql } }: Tree) =>
  sql
    .exec<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT GLOB '_cf_*' ORDER BY name",
    )
    .toArray()
    .map((one) => ({ ...one, sql: one.sql.replace(/\s+/g, " ").replace("IF NOT EXISTS ", "") }));

describe("a database of schema 1", () => {
  it("opens under this code with the example family as it was", () =>
    inTree((tree) => {
      const { sql } = tree.storage;
      empty(tree);
      for (const table of tables) sql.exec(table);
      sql.exec("INSERT INTO history_schema (number) VALUES (1)");
      const family = rowsOf(generateFamily(1, 300));
      fill(sql, family);
      const before = tree.rows();

      migrate(tree.storage, steps);
      const { kinship_person: people, life_subject: lives } = tree.rows();
      expect(people).toEqual(before.kinship_person);
      expect(lives).toEqual(before.life_subject);

      const branchOf = new Map(
        family.branches.flatMap(({ id, members }) => members.people.map((one) => [one, id])),
      );
      const whole = ({ id, version, data }: Row) => ({ ...data, id, version });
      tree.read((c) => {
        for (const row of family.people) {
          const branch = branchOf.get(row.id) ?? null;
          expect(c.kinship.get(row.id as PersonId)).toEqual({ ...whole(row), branch });
        }
        for (const row of family.unions) {
          expect(c.kinship.union(row.id as UnionId)).toEqual({ ...whole(row), branch: null });
        }
        for (const row of family.branches) {
          expect(c.kinship.branch(row.id as BranchId)).toEqual(whole(row));
        }
        for (const row of family.places) {
          expect(c.places.get(row.id as PlaceId)).toEqual(whole(row));
        }
        for (const row of family.sources) {
          expect(c.evidence.source(row.id as SourceId)).toEqual(whole(row));
        }
        for (const { id, data } of family.cited) {
          expect({ citations: c.evidence.citationsOf(id as PersonId) }).toEqual(data);
        }
        for (const { id, data } of family.lives) {
          const { events, takesPart } = data as { events: { id: string }[]; takesPart: object[] };
          const found = c.life.eventsOf(id as PersonId);
          expect(found).toHaveLength(events.length + takesPart.length);
          for (const event of events) expect(found).toContainEqual(event);
        }
      });
      // And it can be edited.
      const ada = family.people[0]?.id as PersonId;
      const changed = tree.do((c) =>
        accepted(c.kinship.apply({ do: "edit-person", id: ada, patch: { sex: "other" } })),
      );
      expect(changed).toEqual([{ aggregate: `person/${ada}`, version: 2 }]);
    }));

  it("is what the first step makes: a step that is out is never edited", () =>
    inTree((tree) => {
      empty(tree);
      for (const table of tables) tree.storage.sql.exec(table);
      const frozen = schemaOf(tree);
      empty(tree);
      migrate(tree.storage, steps.slice(0, 1));
      expect(schemaOf(tree)).toEqual(frozen);
    }));
});

describe("steps", () => {
  const taken = ({ storage: { sql } }: Tree) =>
    sql
      .exec<{ number: number }>("SELECT number FROM history_schema ORDER BY number")
      .toArray()
      .map(({ number }) => number);
  const log: number[] = [];
  const step = (number: number, up: Migration["up"] = () => {}): Migration => ({
    number,
    up(sql) {
      log.push(number);
      up(sql);
    },
  });

  it("are taken in order, each once", () =>
    inTree((tree) => {
      empty(tree);
      log.length = 0;
      migrate(tree.storage, [step(1)]);
      migrate(tree.storage, [step(1)]);
      migrate(tree.storage, [step(1), step(2), step(3)]);
      expect(log).toEqual([1, 2, 3]);
      expect(taken(tree)).toEqual([1, 2, 3]);
    }));

  it("are all taken or none", () =>
    inTree((tree) => {
      empty(tree);
      migrate(tree.storage, [step(1)]);
      const broken = step(3, (sql) => sql.exec("CREATE TABLE x ("));
      const half = step(2, (sql) => sql.exec("CREATE TABLE half (id TEXT)"));
      expect(() => migrate(tree.storage, [step(1), half, broken])).toThrow();
      expect(taken(tree)).toEqual([1]);
      expect(schemaOf(tree).map(({ name }) => name)).not.toContain("half");
    }));

  it("out of order are refused, and so is a database newer than the code", () =>
    inTree((tree) => {
      empty(tree);
      expect(() => migrate(tree.storage, [step(2), step(1)])).toThrow("migrations-out-of-order");
      expect(() => migrate(tree.storage, [step(1), step(1)])).toThrow("migrations-out-of-order");
      migrate(tree.storage, [step(1), step(2)]);
      expect(() => migrate(tree.storage, [step(1)])).toThrow("schema-is-newer");
    }));

  it("were taken when the object started", () =>
    inTree((tree) => {
      expect(taken(tree)).toEqual(steps.map(({ number }) => number));
      expect(tree.read((c) => c.kinship.get(person("nobody")))).toBeNull();
    }));
});
