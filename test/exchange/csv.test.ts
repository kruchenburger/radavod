import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readCsv } from "../../src/contexts/exchange/domain/csv";

/** Writes cells as a spreadsheet does: in quotes only when they need them. */
function writeCsv(rows: string[][], lineBreak: string): string {
  const cellOf = (cell: string) =>
    /[",\r\n]/u.test(cell) || cell.startsWith('"') ? `"${cell.replaceAll('"', '""')}"` : cell;
  return rows.map((row) => row.map(cellOf).join(",")).join(lineBreak);
}

describe("reading CSV", () => {
  it("parts cells by commas and rows by any line break", () => {
    expect(readCsv("a,b\r\nc,d\ne,f\rg,h")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ]);
  });

  it("keeps commas, line breaks and doubled quotes inside quotes", () => {
    expect(readCsv('1,"загінуў, пад Оршай","два\nрадкі","ён сказаў ""так"""\n2,,,')).toEqual([
      ["1", "загінуў, пад Оршай", "два\nрадкі", 'ён сказаў "так"'],
      ["2", "", "", ""],
    ]);
  });

  it("drops the mark of the byte order and the last line break, and reads nothing as no rows", () => {
    expect(readCsv("﻿a,b\n")).toEqual([["a", "b"]]);
    expect(readCsv("")).toEqual([]);
    expect(readCsv("\n")).toEqual([[""]]);
  });

  it("runs a quote that never closes to the end, as spreadsheets do", () => {
    expect(readCsv('a,"b\nc')).toEqual([["a", "b\nc"]]);
  });

  it("reads back what a spreadsheet writes, whatever the cells", () => {
    const cell = fc.string({ unit: fc.constantFrom("a", "ж", ",", '"', "\n", "\r", " ", "\\") });
    // A row of one empty cell is written as nothing, so rows have a cell with something in it.
    const row = fc.array(cell, { minLength: 1, maxLength: 5 }).filter((r) => r.join("") !== "");
    fc.assert(
      fc.property(
        fc.array(row, { minLength: 1, maxLength: 6 }),
        fc.constantFrom("\n", "\r\n"),
        (rows, lineBreak) => {
          expect(readCsv(writeCsv(rows, lineBreak))).toEqual(rows);
        },
      ),
    );
  });
});
