import fc from "fast-check";
import { csv } from "./tables";
import { describe, expect, it } from "vitest";
import { readTable, type Table } from "../../src/contexts/exchange";

function read(text: string): Table | null {
  const table = readTable(text);
  return table.ok ? table.value : null;
}

describe("any table", () => {
  it("is read or refused, and never throws", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 400 }), (text) => {
        const table = readTable(text);
        expect(typeof table.ok).toBe("boolean");
      }),
    );
  });

  it("ties only rows that are there", () => {
    fc.assert(
      fc.property(csv, (text) => {
        const table = read(text);
        if (table === null) return;
        const rows = new Set(table.people.map(({ row: at }) => at));
        expect(rows.size).toBe(table.people.length);
        for (const one of table.people) {
          for (const parent of [one.father, one.mother]) {
            if (parent !== null) expect(rows.has(parent)).toBe(true);
          }
        }
      }),
    );
  });

  it("makes each couple once, of two people who are there, and a couple of the parents of a child", () => {
    fc.assert(
      fc.property(csv, (text) => {
        const table = read(text);
        if (table === null) return;
        const rows = new Set(table.people.map(({ row: at }) => at));
        const couples = table.unions.map(({ partners: [a, b] }) => {
          expect(rows.has(a) && rows.has(b) && a !== b).toBe(true);
          return [a, b].sort((x, y) => x - y).join(" ");
        });
        expect(new Set(couples).size).toBe(couples.length);
        for (const { father, mother } of table.people) {
          if (father !== null && mother !== null && father !== mother) {
            expect(couples).toContain([father, mother].sort((x, y) => x - y).join(" "));
          }
        }
      }),
    );
  });

  it("says why of every date it could not read, and of every row only rows that are there", () => {
    fc.assert(
      fc.property(csv, (text) => {
        const table = read(text);
        if (table === null) return;
        const rows = new Set(table.people.map(({ row: at }) => at));
        for (const problem of table.problems) expect(rows.has(problem.row)).toBe(true);
        const dateProblems = new Set(["unknown-month", "impossible-date", "unreadable-date"]);
        for (const { row: at, birth, death } of table.people) {
          const unread = [birth, death].filter((date) => date !== null && date.parsed === null);
          const said = table.problems.filter((p) => p.row === at && dateProblems.has(p.code));
          expect(said.length).toBe(unread.length);
        }
        const links = table.people.flatMap(({ link }) => link ?? []);
        expect(table.links).toEqual([...new Set(links)]);
      }),
    );
  });
});
