/**
 * Reads the text of a CSV file as a spreadsheet writes it: cells apart by commas, rows by any line
 * break, a cell in double quotes may hold commas, line breaks and a doubled quote. A mark of the byte
 * order at the start is not text. A quote that never closes runs to the end of the file, as
 * spreadsheets read it. Every row is one row of the spreadsheet, whatever line breaks are inside it.
 */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;
  let i = text.startsWith("﻿") ? 1 : 0;
  while (i < text.length) {
    const character = text[i] ?? "";
    if (isQuoted) {
      if (character !== '"') cell += character;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else isQuoted = false;
    } else if (character === '"' && cell === "") isQuoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
    i += 1;
  }
  // The last row may end without a line break; an empty file has no rows.
  if (cell !== "" || row.length > 0 || isQuoted) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
