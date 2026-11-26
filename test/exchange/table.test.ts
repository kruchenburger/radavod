import { describe, expect, it } from "vitest";
import {
  LONGEST_TEXT,
  MOST_ROWS,
  previewOf,
  readTable,
  type Table,
} from "../../src/contexts/exchange";
import family from "./family-table.csv?raw";

/** One row of the table, from the cells of A to O; the rest are empty. */
const line = (...cells: string[]) =>
  [...cells, ...Array<string>(15).fill("")].slice(0, 15).join(",");

function read(...lines: string[]): Table {
  const table = readTable(lines.join("\n"));
  if (!table.ok) throw new Error(table.error.code);
  return table.value;
}

const person = (table: Table, row: number) => {
  const found = table.people.find((one) => one.row === row);
  if (found === undefined) throw new Error(`no row ${row}`);
  return found;
};

describe("a row of the table", () => {
  it("is a person with names, sex, birth, death and a link", () => {
    const table = read(
      line(
        "3",
        "Лазовік",
        "Сымон",
        "Антонавіч",
        "м",
        "12",
        "Март",
        "1898",
        "5/14/1961",
        "Нет возм.",
        "",
        "",
        "https://example.org/a",
      ),
    );
    expect(table.people).toEqual([
      {
        row: 1,
        generation: 3,
        sex: "male",
        living: "no",
        names: [
          {
            id: "n1",
            language: "be",
            script: "Cyrl",
            kind: "birth",
            given: "Сымон",
            patronymic: "Антонавіч",
            surname: "Лазовік",
            certainty: "hypothesis",
          },
        ],
        birth: {
          text: "12 Март 1898",
          parsed: {
            qualifier: "exact",
            calendar: "gregorian",
            from: { year: 1898, month: 3, day: 12 },
          },
        },
        death: {
          text: "14.5.1961",
          parsed: {
            qualifier: "exact",
            calendar: "gregorian",
            from: { year: 1961, month: 5, day: 14 },
          },
        },
        link: "https://example.org/a",
        father: null,
        mother: null,
      },
    ]);
    expect(table.problems).toEqual([]);
    expect(table.links).toEqual(["https://example.org/a"]);
    expect(table.left).toEqual({ statuses: 1, notes: 0 });
  });

  it("gives a woman her current surname as the name shown and the maiden one as of birth", () => {
    for (const surname of ["Лазовік \\ Карніловіч", "Лазовік/Карніловіч"]) {
      const [woman] = read(line("2", surname, "Ганна", "Пятроўна", "ж")).people;
      expect(woman?.names.map(({ id, kind, surname: written }) => [id, kind, written])).toEqual([
        ["n1", "married", "Лазовік"],
        ["n2", "birth", "Карніловіч"],
      ]);
    }
  });

  it("takes one surname of a woman who came in by a marriage as of the marriage", () => {
    const table = read(
      line("1", "Лазовік", "Віктар", "Антонавіч", "м"),
      line("1", "Лазовік", "Вера", "Сцяпанаўна", "ж", "", "", "", "", "", "Прим. Л.В.А."),
      line("1", "Лазовік", "Ала", "Антонаўна", "ж"),
    );
    expect(person(table, 2).names.map(({ kind }) => kind)).toEqual(["married"]);
    expect(person(table, 3).names.map(({ kind }) => kind)).toEqual(["birth"]);
  });

  it("keeps a person nobody named, and a name in Russian or in Latin letters", () => {
    const table = read(
      line("0", "", "", "", "ж"),
      line("0", "Морозов", "Иван"),
      line("0", "Nowak", "Jan"),
    );
    expect(person(table, 1).names).toEqual([]);
    expect(person(table, 2).names[0]).toMatchObject({ language: "ru", script: "Cyrl" });
    expect(person(table, 3).names[0]).toMatchObject({ language: "other", script: "Latn" });
  });

  it("reads the sex as «м» or «ж», and nothing as unknown", () => {
    const table = read(
      line("0", "А", "", "", "М"),
      line("0", "Б", "", "", "ж."),
      line("0", "В"),
      line("0", "Г", "", "", "x"),
    );
    expect(table.people.map(({ sex }) => sex)).toEqual(["male", "female", "unknown", "unknown"]);
    expect(table.problems).toEqual([{ row: 4, code: "unknown-sex", value: "x" }]);
  });

  it("reads whether a person lives", () => {
    const table = read(
      ...["Жив", "Жива", "?", "", "1/2/1950", "умерла"].map((death) =>
        line("0", "А", "", "", "", "", "", "", death),
      ),
    );
    expect(table.people.map(({ living }) => living)).toEqual([
      "yes",
      "yes",
      "unknown",
      "unknown",
      "no",
      "no",
    ]);
    expect(table.people.map(({ death }) => death?.text ?? null)).toEqual([
      null,
      null,
      null,
      null,
      "2.1.1950",
      null,
    ]);
    expect(table.problems).toEqual([]);
  });

  it("reads a birth of any known parts, and a month by its number", () => {
    const births = [
      ["", "", "1898"],
      ["", "Январь", "1900"],
      ["7", "июля", "1927"],
      ["7", "7", "1927"],
    ].map(([day = "", month = "", year = ""]) => line("0", "А", "", "", "", day, month, year));
    const table = read(...births);
    expect(table.people.map(({ birth }) => birth?.parsed?.from)).toEqual([
      { year: 1898 },
      { year: 1900, month: 1 },
      { year: 1927, month: 7, day: 7 },
      { year: 1927, month: 7, day: 7 },
    ]);
    expect(table.problems).toEqual([]);
  });

  it("keeps a date it cannot read as written, and says why", () => {
    const table = read(
      line("0", "А", "", "", "", "2", "Янврь", "1934"),
      line("0", "Б", "", "", "", "30", "Февраль", "1931"),
      line("0", "В", "", "", "", "12", "Май"),
      line("0", "Г", "", "", "", "", "", "", "13/13/1950"),
      line("0", "Д", "", "", "", "", "", "", "абы-калі"),
    );
    expect(table.people.map(({ birth, death }) => [birth, death])).toEqual([
      [{ text: "2 Янврь 1934", parsed: null }, null],
      [{ text: "30 Февраль 1931", parsed: null }, null],
      [{ text: "12 Май", parsed: null }, null],
      [null, { text: "13/13/1950", parsed: null }],
      [null, { text: "абы-калі", parsed: null }],
    ]);
    expect(table.problems).toEqual([
      { row: 1, code: "unknown-month", value: "Янврь" },
      { row: 2, code: "impossible-date", value: "30 Февраль 1931" },
      { row: 3, code: "unreadable-date", value: "12 Май" },
      { row: 4, code: "impossible-date", value: "13/13/1950" },
      { row: 5, code: "unreadable-date", value: "абы-калі" },
    ]);
  });

  it("keeps a patronymic of the other sex as written, and says so", () => {
    const table = read(
      line("0", "А", "Галіна", "Іванавіч", "ж"),
      line("0", "Б", "Аксана", "Аляксандраўна", "м"),
      line("0", "В", "Ян", "Іванавіч", ""),
      line("0", "Г", "Іна", "Ильинична", "ж"),
    );
    expect(person(table, 1).names[0]?.patronymic).toBe("Іванавіч");
    expect(table.problems).toEqual([
      { row: 1, code: "male-patronymic", value: "Іванавіч" },
      { row: 2, code: "female-patronymic", value: "Аляксандраўна" },
    ]);
  });

  it("says when the generation is no number, and does not check parents by it", () => {
    const table = read(
      line("0?", "А", "", "", "м"),
      line("", "Б", "", "", "м", "", "", "", "", "", "", "", "", "1"),
    );
    expect(table.problems).toEqual([{ row: 1, code: "unknown-generation", value: "0?" }]);
    expect(person(table, 2).father).toBe(1);
  });

  it("counts rows as the spreadsheet does, empty ones and line breaks in a cell included", () => {
    const table = read(
      line("1", "А", "", "", "м"),
      line(),
      line("0", '"Б\nВ"', "", "", "м", "", "", "", "", "", "", "", "", "1"),
    );
    expect(table.people.map(({ row, father }) => [row, father])).toEqual([
      [1, null],
      [3, 1],
    ]);
  });

  it("refuses a table too long to be a family, and one with nobody", () => {
    expect(readTable("x".repeat(LONGEST_TEXT + 1))).toEqual({
      ok: false,
      error: { code: "too-large" },
    });
    const rows = Array.from({ length: MOST_ROWS + 1 }, () => line("0", "А"));
    expect(readTable(rows.join("\n"))).toEqual({ ok: false, error: { code: "too-large" } });
    expect(readTable(rows.slice(1).join("\n")).ok).toBe(true);
    expect(readTable(`${line()}\n${line()}\n`)).toEqual({
      ok: false,
      error: { code: "empty-table" },
    });
    expect(readTable("")).toEqual({ ok: false, error: { code: "empty-table" } });
  });
});

describe("parents", () => {
  it("are the rows of columns N and O", () => {
    const table = read(
      line("1", "Б", "Ян", "", "м"),
      line("1", "Б", "Ева", "", "ж"),
      line("0", "Б", "Ала", "", "ж", "", "", "", "", "", "", "", "", "1", "2"),
    );
    expect([person(table, 3).father, person(table, 3).mother]).toEqual([1, 2]);
    expect(table.unions).toEqual([{ partners: [1, 2], kind: "unknown" }]);
    expect(table.problems).toEqual([]);
  });

  it("are left out when no row is there, and said so with what is written", () => {
    const table = read(
      line("1", "Б", "Ян", "", "м"),
      line("0", "Б", "Ала", "", "ж", "", "", "", "", "", "", "", "", "9", "x"),
      line(),
      line("0", "Б", "Ян", "", "м", "", "", "", "", "", "", "", "", "", "3"),
    );
    expect(table.problems).toEqual([
      { row: 2, code: "missing-father", value: "9" },
      { row: 2, code: "missing-mother", value: "x" },
      { row: 4, code: "missing-mother", value: "3" },
    ]);
    expect([person(table, 2).father, person(table, 2).mother, person(table, 4).mother]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("are rows as written; whether the tree takes them is for the import to say", () => {
    const table = read(
      line("1", "А", "", "", "м", "", "", "", "", "", "", "", "", "2"),
      line("0", "Б", "", "", "м", "", "", "", "", "", "", "", "", "1", "1"),
    );
    expect([person(table, 1).father, person(table, 2).father, person(table, 2).mother]).toEqual([
      2, 1, 1,
    ]);
    // A row is no couple with itself.
    expect(table.unions).toEqual([]);
  });

  it("of an odd generation or sex are kept, and said so", () => {
    const table = read(
      line("2", "А", "", "", "ж"),
      line("1", "Б", "", "", "м"),
      line("0", "В", "", "", "м", "", "", "", "", "", "", "", "", "1", "2"),
    );
    expect([person(table, 3).father, person(table, 3).mother]).toEqual([1, 2]);
    expect(table.problems).toEqual([
      { row: 3, code: "parent-generation", parent: 1 },
      { row: 3, code: "father-female", parent: 1 },
      { row: 3, code: "mother-male", parent: 2 },
    ]);
  });
});

describe("a spouse by the initials", () => {
  const husband = (given: string, row = "1") => line(row, "Лазовік", given, "Пятровіч", "м");
  const wife = (initials: string, generation = "1") =>
    line(
      generation,
      "Лазовік \\ Грыц",
      "Алеся",
      "Іванаўна",
      "ж",
      "",
      "",
      "",
      "",
      "",
      `Прим. ${initials}`,
    );

  it("is the one person of the same generation and the other sex the initials fit", () => {
    const table = read(
      husband("Анатоль"),
      line("1", "Лазовік", "Ала", "Пятроўна", "ж"),
      husband("Віктар"),
      wife("Л.А.П."),
    );
    expect(table.unions).toEqual([{ partners: [4, 1], kind: "marriage" }]);
    expect(table.problems).toEqual([]);
  });

  it("are read with or without the word and spaces, two or three of them, and never as one word", () => {
    for (const initials of ["Л. А. П.", "ЛАП", "Л.А."]) {
      const table = read(
        husband("Анатоль"),
        wife(initials).replace("Прим. ", initials === "ЛАП" ? "" : "Прим."),
      );
      expect(table.unions.length, initials).toBe(initials === "ЛАП" ? 0 : 1);
    }
  });

  it("of a woman fits her maiden surname too", () => {
    const table = read(
      line("1", "Лазовік \\ Мароз", "Ала", "Пятроўна", "ж"),
      line("1", "Сідарэвіч", "Ян", "Сямёнавіч", "м", "", "", "", "", "", "Прим. М.А.П."),
    );
    expect(table.unions).toEqual([{ partners: [2, 1], kind: "marriage" }]);
  });

  it("of several is the one on the next row, and is nobody when none or several are there", () => {
    const table = read(
      husband("Анатоль"),
      wife("Л.А.П."),
      husband("Аляксей"),
      line("1", "Дубіцкі", "Ян", "", "м"),
      wife("Л.А.П."),
      wife("К.В.С."),
      wife("Л.А.П.", "2"),
    );
    // Row 2 has two husbands next to it.
    expect(table.unions).toEqual([]);
    expect(table.problems).toEqual([
      { row: 2, code: "ambiguous-spouse", value: "Прим. Л.А.П.", rows: [1, 3] },
      { row: 5, code: "ambiguous-spouse", value: "Прим. Л.А.П.", rows: [1, 3] },
      { row: 6, code: "unknown-spouse", value: "Прим. К.В.С." },
      { row: 7, code: "unknown-spouse", value: "Прим. Л.А.П." },
    ]);
  });

  it("makes one union of two who name each other, and it is the union of their child", () => {
    const table = read(
      line("1", "Лазовік", "Анатоль", "Пятровіч", "м", "", "", "", "", "", "Прим. Л.А.І."),
      wife("Л.А.П."),
      line("0", "Лазовік", "Ян", "Анатолевіч", "м", "", "", "", "", "", "", "", "", "1", "2"),
    );
    expect(table.unions).toEqual([{ partners: [1, 2], kind: "marriage" }]);
    expect(table.problems).toEqual([]);
  });
});

describe("the invented family table", () => {
  const table = read(family);

  it("is read whole, with the problems it was made with", () => {
    expect(table.people).toHaveLength(44);
    expect(table.problems.map(({ row, code }) => `${row} ${code}`)).toEqual([
      "8 impossible-date",
      "11 unknown-month",
      "16 male-patronymic",
      "28 ambiguous-spouse",
      "35 female-patronymic",
      "38 missing-mother",
      "39 parent-generation",
      "39 parent-generation",
      "40 unknown-spouse",
      "41 parent-generation",
      "42 parent-generation",
      "42 father-female",
      "43 unreadable-date",
      "45 unknown-generation",
      "45 unknown-sex",
    ]);
  });

  it("ties the couples by their initials, and by their children", () => {
    const couples = table.unions.map(({ partners }) =>
      [...partners].sort((a, b) => a - b).join("+"),
    );
    expect(couples.sort()).toEqual(
      [
        "1+2",
        "3+4",
        "5+6",
        "7+8",
        "9+10",
        "12+13",
        "15+16",
        "17+18",
        "20+21",
        "22+23",
        "25+26",
        "19+27",
      ].sort(),
    );
    expect(person(table, 37)).toMatchObject({ father: 27, mother: 19 });
  });

  it("is told before it is added", () => {
    const preview = previewOf(table);
    expect(preview).toMatchObject({
      unions: 12,
      sources: 3,
      left: { statuses: 44, notes: 2 },
    });
    expect(preview.people[1]).toEqual({
      row: 2,
      given: "Ганна",
      patronymic: "Пятроўна",
      surname: "Лазовік",
      maiden: "Карніловіч",
      born: "Май 1902",
      died: "2.11.1979",
      living: "no",
    });
    expect(preview.parents).toBe(
      table.people.filter(({ father }) => father !== null).length +
        table.people.filter(({ mother }) => mother !== null).length,
    );
  });
});

describe("a note many fit", () => {
  it("tells the first ten rows and that there are more", () => {
    const husbands = Array.from({ length: 12 }, () => line("", "Лазовік", "Ян", "", "м"));
    const table = read(
      ...husbands,
      "",
      "",
      line("", "Лазовік", "Ала", "", "ж", "", "", "", "", "", "Прим. Л.Я."),
    );
    expect(table.problems).toEqual([
      {
        row: 15,
        code: "ambiguous-spouse",
        value: "Прим. Л.Я.",
        rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        more: true,
      },
    ]);
  });
});
