import { monthOf } from "../../../kernel/date-words";
import { type FuzzyDate, parseFuzzyDate } from "../../../kernel/fuzzy-date";
import { foldName, type Language, type NameForm, type Script } from "../../../kernel/name-form";
import type { Result } from "../../../kernel/result";
import { readCsv } from "./csv";

/**
 * A family table as relatives keep it in a spreadsheet and export it to CSV: UTF-8, commas, no row of
 * headings, a person a row. The columns, from A:
 *
 * | Column | What                                                                                  |
 * | ------ | ------------------------------------------------------------------------------------- |
 * | A      | The generation: 0 the youngest of the one who made the table, 1 their parents, and up |
 * | B      | The surname; of a woman «current \ maiden», a slash will do too                       |
 * | C, D   | The given name and the patronymic                                                     |
 * | E      | The sex: «м» or «ж»                                                                   |
 * | F-H    | The day, the month by its name («Январь») and the year of birth                       |
 * | I      | The death: a date as M/D/YYYY, «Жив» or «Жива», «?», or nothing                       |
 * | J      | How the questionnaire went: not a fact of the tree, it is left out                    |
 * | K      | «Прим. Ф.И.О.»: the initials of the spouse through whom the person came in            |
 * | L      | Notes of the one who made the table: left out                                         |
 * | M      | A link to more about the person: a source                                             |
 * | N, O   | The rows of the father and of the mother, counted from 1 as the spreadsheet does      |
 *
 * Every row is read as far as it can be; what cannot be read is a problem of its row, and the rest
 * stays. A problem keeps a link out only when it leads nowhere: a parent that is no row, a spouse
 * nobody or several could be. A parent the tree refuses, as a descendant, is told by the import.
 */
export type Table = {
  people: TablePerson[];
  unions: TableUnion[];
  /** Every link of column M once, in the order they first come. */
  links: string[];
  problems: Problem[];
  /** How many rows have something in the columns that are left out. */
  left: { statuses: number; notes: number };
};

export type TablePerson = {
  /** The row of the spreadsheet, from 1. It stands for the person until the person is in the tree. */
  row: number;
  generation: number | null;
  sex: "male" | "female" | "unknown";
  living: "yes" | "no" | "unknown";
  /** The current name first. A woman with a maiden surname has it as a second name, of birth. */
  names: NameForm[];
  birth: FuzzyDate | null;
  death: FuzzyDate | null;
  link: string | null;
  /** The rows of the parents, as far as they are rows of the table. */
  father: number | null;
  mother: number | null;
};

/** A couple, by their rows: married by column K, or of unknown kind as the parents of a child. */
export type TableUnion = { partners: [number, number]; kind: "marriage" | "unknown" };

export type Problem = {
  row: number;
  code: ProblemCode;
  /** What is written in the cell the problem is of. */
  value?: string;
  /** The row a parent is given as. */
  parent?: number;
  /** The rows the initials of a spouse fit, the first ten of them. */
  rows?: number[];
  /** More rows fit than are told. */
  more?: true;
};

export type ProblemCode =
  | "unknown-generation"
  | "unknown-sex"
  | "unknown-month"
  | "impossible-date"
  | "unreadable-date"
  | "male-patronymic"
  | "female-patronymic"
  | "missing-father"
  | "missing-mother"
  | "same-parent"
  | "parent-cycle"
  | "parent-generation"
  | "father-female"
  | "mother-male"
  | "unknown-spouse"
  | "ambiguous-spouse";

export type TableError = { code: "too-large" } | { code: "empty-table" };

/** A family is checked up to 5 000 people; a text this long is no family table. */
export const MOST_ROWS = 5_000;
export const LONGEST_TEXT = 2_000_000;

/** Of the rows that fit a note, so many are told: a keeper reads the rest in the table. */
const MOST_ROWS_TOLD = 10;

const column = {
  generation: 0,
  surname: 1,
  given: 2,
  patronymic: 3,
  sex: 4,
  day: 5,
  month: 6,
  year: 7,
  death: 8,
  status: 9,
  spouse: 10,
  note: 11,
  link: 12,
  father: 13,
  mother: 14,
} as const;

/** A row as it is read before the rows are tied to each other, with what ties it as it is written. */
type Read = TablePerson & { spouse: string | null; written: { father: string; mother: string } };

export function readTable(text: string): Result<Table, TableError> {
  if (text.length > LONGEST_TEXT) return { ok: false, error: { code: "too-large" } };
  const problems: Problem[] = [];
  const left = { statuses: 0, notes: 0 };
  const rows: Read[] = [];
  for (const [index, cells] of readCsv(text).entries()) {
    const cell = (at: number) => (cells[at] ?? "").trim();
    if (cells.every((one) => one.trim() === "")) continue;
    if (rows.length === MOST_ROWS) return { ok: false, error: { code: "too-large" } };
    if (cell(column.status) !== "") left.statuses += 1;
    if (cell(column.note) !== "") left.notes += 1;
    rows.push(readRow(index + 1, cell, (problem) => problems.push(problem)));
  }
  if (rows.length === 0) return { ok: false, error: { code: "empty-table" } };
  const tied = tie(rows);
  const people = rows.map(({ spouse: _spouse, written: _written, ...person }) => person);
  const links = [...new Set(people.flatMap(({ link }) => link ?? []))];
  const all = [...problems, ...tied.problems].sort((a, b) => a.row - b.row);
  return { ok: true, value: { people, unions: tied.unions, links, problems: all, left } };
}

function readRow(row: number, cell: (at: number) => string, report: (p: Problem) => void): Read {
  const problem = (code: ProblemCode, value: string) => report({ row, code, value });
  const generationText = cell(column.generation);
  const generation = /^\d{1,3}$/u.test(generationText) ? Number(generationText) : null;
  if (generation === null && generationText !== "") problem("unknown-generation", generationText);

  const sex = sexOf(cell(column.sex));
  if (sex === null) problem("unknown-sex", cell(column.sex));

  const spouse = cell(column.spouse);
  const names = namesOf(cell, sex === "female" && spouse !== "");
  const patronymic = cell(column.patronymic);
  const patronymicSex = sexOfPatronymic(patronymic);
  if (sex === "female" && patronymicSex === "male") problem("male-patronymic", patronymic);
  if (sex === "male" && patronymicSex === "female") problem("female-patronymic", patronymic);

  const birth = birthOf(cell(column.day), cell(column.month), cell(column.year));
  if (birth.problem === "unknown-month") problem(birth.problem, cell(column.month));
  else if (birth.problem !== null) problem(birth.problem, birth.date?.text ?? "");
  const death = deathOf(cell(column.death));
  if (death.problem !== null) problem(death.problem, cell(column.death));

  const link = cell(column.link);
  return {
    row,
    generation,
    sex: sex ?? "unknown",
    living: death.living,
    names,
    birth: birth.date,
    death: death.date,
    link: link === "" ? null : link,
    father: null,
    mother: null,
    spouse: spouse === "" ? null : spouse,
    written: { father: cell(column.father), mother: cell(column.mother) },
  };
}

/** Null for what is written and is no sex; nothing written is a sex nobody knows. */
function sexOf(text: string): TablePerson["sex"] | null {
  if (text === "") return "unknown";
  if (/^м(?:уж(?:ской)?)?\.?$/iu.test(text)) return "male";
  if (/^ж(?:ен(?:ский)?)?\.?$/iu.test(text)) return "female";
  return null;
}

/** Whose a patronymic is by its ending, in Russian and in Belarusian. */
function sexOfPatronymic(patronymic: string): "male" | "female" | null {
  if (/(?:[иі]ч|оглы|улы)$/iu.test(patronymic)) return "male";
  if (/(?:на|кызы)$/iu.test(patronymic)) return "female";
  return null;
}

function namesOf(cell: (at: number) => string, isMarriedIn: boolean): NameForm[] {
  const [current = "", ...maiden] = cell(column.surname)
    .split(/[\\/]/u)
    .map((part) => part.trim());
  const given = cell(column.given);
  const patronymic = cell(column.patronymic);
  const born = maiden.filter((part) => part !== "").join(" ");
  if (current === "" && born === "" && given === "" && patronymic === "") return [];
  const all = `${current}${born}${given}${patronymic}`;
  const form = (id: string, kind: NameForm["kind"], surname: string): NameForm => ({
    id,
    language: languageOf(all),
    script: scriptOf(all),
    kind,
    given,
    patronymic,
    surname,
    certainty: "hypothesis",
  });
  if (born !== "") return [form("n1", "married", current), form("n2", "birth", born)];
  // A woman who came in by a marriage carries the surname of it.
  return [form("n1", isMarriedIn ? "married" : "birth", current)];
}

function scriptOf(text: string): Script {
  if (/\p{Script=Cyrillic}/u.test(text)) return "Cyrl";
  if (/\p{Script=Latin}/u.test(text)) return "Latn";
  return text === "" ? "Cyrl" : "other";
}

/** Belarusian has letters Russian has not; any other Cyrillic name is taken as Russian. */
function languageOf(text: string): Language {
  if (/[ўЎіІ]/u.test(text)) return "be";
  return scriptOf(text) === "Cyrl" ? "ru" : "other";
}

type Dated = { date: FuzzyDate | null; problem: ProblemCode | null };

/** The day, the month and the year of birth, as the kernel reads a date. A gap is no problem. */
function birthOf(day: string, month: string, year: string): Dated {
  if (day === "" && month === "" && year === "") return { date: null, problem: null };
  const isNumber = /^\d{1,2}$/u.test(month);
  const parts = [day, month, year].filter((part) => part !== "");
  // A month in words is read with its words, a month by its number as a date in figures.
  const date = parseFuzzyDate(parts.join(isNumber ? "." : " "));
  if (month !== "" && !isNumber && monthOf(month) === undefined) {
    return { date: { text: date.text, parsed: null }, problem: "unknown-month" };
  }
  if (date.parsed !== null) return { date, problem: null };
  const isWhole = /^\d{1,2}$/u.test(day) && month !== "" && /^\d{4}$/u.test(year);
  return { date, problem: isWhole ? "impossible-date" : "unreadable-date" };
}

type Death = Dated & { living: TablePerson["living"] };

/** A spreadsheet writes the date of a death month first: 5/13/1943 is 13 May 1943. */
function deathOf(text: string): Death {
  if (text === "" || /^\?+$/u.test(text)) return { living: "unknown", date: null, problem: null };
  if (/^жив[ао]?\.?$/iu.test(text)) return { living: "yes", date: null, problem: null };
  if (/^(?:умер(?:ла)?|ум\.)$/iu.test(text)) return { living: "no", date: null, problem: null };
  const monthFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(text);
  if (monthFirst !== null) {
    const [, month, day, year] = monthFirst;
    const date = parseFuzzyDate(`${day}.${month}.${year}`);
    if (date.parsed !== null) return { living: "no", date, problem: null };
    return { living: "no", date: { text, parsed: null }, problem: "impossible-date" };
  }
  const date = parseFuzzyDate(text);
  return { living: "no", date, problem: date.parsed === null ? "unreadable-date" : null };
}

type Tied = { unions: TableUnion[]; problems: Problem[] };

/** Ties the rows: parents by columns N and O, spouses by column K, the parents of a child as a couple. */
function tie(rows: Read[]): Tied {
  const problems: Problem[] = [];
  const byRow = new Map(rows.map((person) => [person.row, person]));
  const unions: TableUnion[] = [];
  const couples = new Set<string>();
  const marry = (a: number, b: number, kind: TableUnion["kind"]) => {
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    if (couples.has(key)) return;
    couples.add(key);
    unions.push({ partners: [a, b], kind });
  };

  const byInitials = initialsIndex(rows);
  for (const person of rows) {
    if (person.spouse === null) continue;
    const found = spouseOf(person, byInitials);
    if (found.length === 1) marry(person.row, found[0] ?? 0, "marriage");
    else {
      problems.push({
        row: person.row,
        code: found.length === 0 ? "unknown-spouse" : "ambiguous-spouse",
        value: person.spouse,
        ...(found.length > 0 ? { rows: found.slice(0, MOST_ROWS_TOLD) } : {}),
        ...(found.length > MOST_ROWS_TOLD ? { more: true as const } : {}),
      });
    }
  }

  for (const child of rows) {
    const father = parentOf(child, "father", byRow, problems);
    const mother = parentOf(child, "mother", byRow, problems);
    child.father = father;
    child.mother = mother;
    // Whether a row may be a parent at all is for the tree to say; a row is no couple with itself.
    if (father !== null && mother !== null && father !== mother) marry(father, mother, "unknown");
  }
  return { unions, problems };
}

function parentOf(
  child: Read,
  as: "father" | "mother",
  byRow: ReadonlyMap<number, Read>,
  problems: Problem[],
): number | null {
  const text = child.written[as];
  if (text === "") return null;
  const row = /^\d{1,6}$/u.test(text) ? Number(text) : 0;
  const parent = byRow.get(row);
  const problem = (code: ProblemCode, more: Partial<Problem>) => {
    problems.push({ row: child.row, code, ...more });
    return null;
  };
  if (parent === undefined) {
    return problem(as === "father" ? "missing-father" : "missing-mother", { value: text });
  }
  const { generation } = child;
  if (generation !== null && parent.generation !== null && parent.generation !== generation + 1) {
    problems.push({ row: child.row, code: "parent-generation", parent: row });
  }
  if (as === "father" && parent.sex === "female") {
    problems.push({ row: child.row, code: "father-female", parent: row });
  }
  if (as === "mother" && parent.sex === "male") {
    problems.push({ row: child.row, code: "mother-male", parent: row });
  }
  return row;
}

/**
 * Whom the note of column K names. «Прим. Ф.И.О.» are initials as Russian writes them, surname first;
 * two letters are the surname and the given name, and a woman's surname may be either of hers. Only
 * somebody of the same generation and not of the same sex is taken; of several, the one on the row
 * next to the person. The rows of all who fit, so one is the spouse and none or several are a problem.
 */
function spouseOf(person: Read, byInitials: ReadonlyMap<string, Read[]>): number[] {
  const initials = initialsOf(person.spouse ?? "");
  if (initials === null) return [];
  const fits = (byInitials.get(initials.join(" ")) ?? []).filter(
    (other) =>
      other !== person &&
      (person.generation === null ||
        other.generation === null ||
        other.generation === person.generation) &&
      (person.sex === "unknown" || other.sex !== person.sex),
  );
  const next = fits.filter(({ row }) => Math.abs(row - person.row) === 1);
  return (fits.length > 1 && next.length === 1 ? next : fits).map(({ row }) => row);
}

/** The letters of «Прим. И.И.И.», folded as names are compared, or null for other words. */
function initialsOf(note: string): string[] | null {
  const letters = note
    .replace(/^прим\.?/iu, "")
    .split(/[.\s]+/u)
    .filter((part) => part !== "");
  const areLetters = letters.every((letter) => /^\p{L}$/u.test(letter));
  return areLetters && letters.length >= 2 && letters.length <= 3 ? letters.map(foldName) : null;
}

/**
 * Everybody by the initials of each of their names, two letters and three, so a note is looked up
 * and not compared with every row: a table of thousands has a note in many rows.
 */
function initialsIndex(rows: readonly Read[]): Map<string, Read[]> {
  const index = new Map<string, Read[]>();
  for (const person of rows) {
    const keys = person.names.flatMap(({ surname, given, patronymic }) => {
      const [s, g, p] = [surname, given, patronymic].map((part) => foldName(part).slice(0, 1));
      return [`${s} ${g}`, `${s} ${g} ${p}`];
    });
    for (const key of new Set(keys)) {
      const found = index.get(key);
      if (found === undefined) index.set(key, [person]);
      else found.push(person);
    }
  }
  return index;
}
