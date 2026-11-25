import { describe, expect, it } from "vitest";
import { generateFamily } from "../examples/generate.ts";
import type { Parentage } from "../src/contexts/kinship";
import type { LifeEvent } from "../src/contexts/life";
import { parseFuzzyDate } from "../src/kernel/fuzzy-date";
import type { PersonId, UnionId } from "../src/kernel/id";
import type { Contexts } from "../src/scenarios/unit-of-work";
import { fill, rowsOf } from "./storage/schema-1";
import {
  accepted,
  addBranch,
  addParent,
  addPerson,
  addUnion,
  branch,
  citation,
  event,
  form,
  inTree,
  parentage,
  person,
  source,
  union,
} from "./storage/tree";

/**
 * Rows read and written over 5 000 invented people, counted by the cursors of the database. The limits
 * are those of the free plan: an edit at most 20 rows written.
 */
const size = 5000;

type Person = { id: string; data: { parents: Parentage[]; children: string[]; unions: string[] } };

describe("rows over 5 000 people", () => {
  it("stay within the budgets", { timeout: 180_000 }, () =>
    inTree((tree) => {
      const family = rowsOf(generateFamily(1, size));
      fill(tree.storage.sql, family);
      const people = family.people as unknown as Person[];
      const numbers: Record<string, { read: number; written: number; limit: number }> = {};
      const measure = (
        what: string,
        limit: number,
        work: Parameters<typeof tree.do>[0],
      ): ReturnType<typeof tree.do> => {
        let changed: ReturnType<typeof tree.do> = [];
        numbers[what] = { ...tree.count(() => (changed = tree.do(work))), limit };
        return changed;
      };

      const married = people.find(({ data }) => data.unions.length > 0 && data.children.length > 2);
      if (married === undefined) throw new Error("nobody is married");
      const ada = married.id as PersonId;
      measure("edit a name", 20, (c) =>
        accepted(c.kinship.apply({ do: "put-name", person: ada, name: form("new") })),
      );

      const birth = (who: PersonId, name: string): LifeEvent => ({
        id: event(name),
        kind: "birth",
        title: "",
        date: parseFuzzyDate("12.05.1885"),
        place: null,
        participants: [{ person: who, role: "principal" }],
        union: null,
        main: true,
        certainty: "hypothesis",
        note: "",
      });
      measure("add an event", 20, (c) => accepted(c.life.add(birth(ada, "new e1"))));

      const book = source("new book");
      tree.do((c) =>
        accepted(
          c.evidence.addSource({ id: book, kind: "book", title: "", repository: "", note: "" }),
        ),
      );
      const [couple] = married.data.unions;
      const partners = tree.read((c) => c.kinship.union(couple as UnionId)?.partners) ?? [];
      measure("add a child with a birth and five citations", 20, (c) => {
        addPerson(c, "child");
        for (const partner of partners) {
          if (partner === "unknown") continue;
          const link = parentage("x", { id: partner, parent: partner, union: couple as UnionId });
          accepted(c.kinship.apply({ do: "add-parent", child: person("child"), parentage: link }));
        }
        accepted(c.life.add(birth(person("child"), "new e2")));
        const facts = [
          "name:n1",
          `event:${event("new e2")}`,
          ...partners.map((one) => `parentage:${one}`),
          "name:n1",
        ];
        for (const [i, fact] of facts.entries()) {
          accepted(
            c.evidence.cite({
              id: citation(`new c${i}`),
              source: book,
              fact: { subject: person("child"), fact },
              page: "",
              quote: "",
            }),
          );
        }
      });

      const below = new Map(people.map(({ id, data }) => [id, data.children]));
      const descendants = (id: string): number => {
        const found = new Set([id]);
        for (const one of found) for (const child of below.get(one) ?? []) found.add(child);
        return found.size - 1;
      };
      const top = people.find(({ data, id }) => data.parents.length === 0 && descendants(id) > 400);
      if (top === undefined) throw new Error("no big line");
      tree.do((c) => addBranch(c, "new"));
      const given = measure("give a branch to 300 and more", 20, (c) =>
        accepted(
          c.kinship.apply({
            do: "assign-branch",
            person: top.id as PersonId,
            branch: branch("new"),
            descendants: true,
            overwrite: true,
          }),
        ),
      );
      expect(given.length).toBeGreaterThan(300);
      const taken = measure("remove a branch of 300 and more", 20, (c) =>
        accepted(c.kinship.apply({ do: "remove-branch", id: branch("new") })),
      );
      expect(taken.length).toBe(given.length + 1);

      tree.do((c) => {
        addPerson(c, "father");
        addPerson(c, "mother");
        addUnion(c, "big", "father", "mother");
        for (let i = 0; i < 12; i++) {
          addPerson(c, `kid ${i}`);
          addParent(c, `kid ${i}`, "father", { union: union("big") });
          addParent(c, `kid ${i}`, "mother", { union: union("big") });
        }
      });
      measure("remove a union with 12 children", 40, (c) =>
        accepted(c.kinship.apply({ do: "remove-union", id: union("big") })),
      );

      const ordered = (c: Contexts, order: string[]) =>
        accepted(
          c.kinship.apply({
            do: "order-children",
            person: person("patriarch"),
            order: order.map(person),
          }),
        );
      const kids = Array.from({ length: 20 }, (_, i) => `son ${i}`);
      tree.do((c) => {
        addPerson(c, "patriarch");
        for (const kid of kids) {
          addPerson(c, kid);
          addParent(c, kid, "patriarch");
        }
        ordered(c, kids);
      });
      measure("order 20 children", 20, (c) => ordered(c, kids.toReversed()));
      measure("remove a parent of 20 in order", 20, (c) =>
        accepted(c.kinship.apply({ do: "remove-parent", child: person("son 1"), id: "patriarch" })),
      );

      const guests = people.slice(0, 20).map(({ id }) => id as PersonId);
      const wedding: LifeEvent = {
        ...birth(ada, "new e3"),
        kind: "wedding",
        participants: guests.map((one) => ({ person: one, role: "witness" })),
      };
      measure("add an event with 20 participants", 60, (c) => accepted(c.life.add(wedding)));
      measure("drop one of 20 participants", 20, (c) =>
        accepted(
          c.life.edit(guests[0] as PersonId, {
            ...wedding,
            participants: wedding.participants.slice(0, -1),
          }),
        ),
      );
      measure("remove an event with 20 participants", 60, (c) =>
        accepted(c.life.remove(guests[0] as PersonId, wedding.id)),
      );

      for (const [what, { written, read, limit }] of Object.entries(numbers)) {
        expect(written, what).toBeGreaterThan(0);
        expect(written, what).toBeLessThanOrEqual(limit);
        // Reading is cheap, but not the whole family: only a branch walks down its line.
        expect(read, what).toBeLessThan(what.includes("300") ? 2000 : 150);
      }
    }),
  );
});
