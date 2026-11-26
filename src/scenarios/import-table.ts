import type { EvidenceError } from "../contexts/evidence";
import {
  intoEmptyTree,
  type Preview,
  previewOf,
  readTable,
  type Problem,
  type TableError,
  type TablePerson,
  type TreeNotEmpty,
} from "../contexts/exchange";
import type { KinshipError } from "../contexts/kinship";
import type { LifeError } from "../contexts/life";
import type { FuzzyDate } from "../kernel/fuzzy-date";
import type { Id, PersonId, UnionId } from "../kernel/id";
import type { Result } from "../kernel/result";
import type { TablePreview } from "../shared/exchange";
import type { Contexts } from "./unit-of-work";

export type ImportTableError = TableError | TreeNotEmpty | KinshipError | LifeError | EvidenceError;

/** Identifiers are made outside the tree and handed in. */
export type NewId = <K extends "person" | "union" | "event" | "source" | "citation">(
  kind: K,
) => Id<K>;

// What the browser is told is what the table makes.
const told: (preview: Preview) => TablePreview = (preview) => preview;

/**
 * Puts a family table into a tree without people: every person with their names, birth and death,
 * the couples, the parents, and a source for each link. Everything is a hypothesis: a table is no
 * source of its own. Run as a preview it says what it would add and writes nothing.
 */
export function importTable(
  c: Contexts,
  text: string,
  newId: NewId,
): Result<TablePreview, ImportTableError> {
  const read = readTable(text);
  if (!read.ok) return read;
  const empty = intoEmptyTree({
    hasPeople: c.kinship.someone(),
    hasTrashed: c.history.trash.everybody().length > 0,
  });
  if (!empty.ok) return empty;
  const table = read.value;

  const people = new Map<number, PersonId>();
  for (const one of table.people) {
    const id = newId("person");
    people.set(one.row, id);
    const { sex, living, names } = one;
    const added = c.kinship.apply({
      do: "add-person",
      person: { id, sex, living, names, mainName: names[0]?.id ?? null },
      branch: null,
    });
    if (!added.ok) return added;
  }
  const of = (row: number): PersonId => {
    const id = people.get(row);
    // The table ties only rows it has.
    if (id === undefined) throw new Error(`no row ${row}`);
    return id;
  };

  const unions = new Map<string, UnionId>();
  for (const { partners, kind } of table.unions) {
    const id = newId("union");
    unions.set(coupleOf(...partners), id);
    const added = c.kinship.apply({
      do: "add-union",
      union: {
        id,
        partners: [of(partners[0]), of(partners[1])],
        kind,
        branch: null,
        certainty: "hypothesis",
      },
    });
    if (!added.ok) return added;
  }

  // A parent the rules of kinship refuse is left out and told, as the table's own problems are.
  const refused: Problem[] = [];
  for (const child of table.people) {
    const { father, mother } = child;
    const union =
      father !== null && mother !== null ? (unions.get(coupleOf(father, mother)) ?? null) : null;
    for (const parent of [father, mother]) {
      if (parent === null) continue;
      const added = c.kinship.apply({
        do: "add-parent",
        child: of(child.row),
        parentage: {
          id: of(parent),
          parent: of(parent),
          union,
          kind: "blood",
          main: true,
          certainty: "hypothesis",
        },
      });
      if (added.ok) continue;
      const { code } = added.error;
      if (code !== "cycle" && code !== "duplicate") return added;
      refused.push({
        row: child.row,
        code: code === "cycle" ? "parent-cycle" : "same-parent",
        parent,
      });
    }
  }

  for (const one of table.people) {
    for (const [kind, date] of [
      ["birth", one.birth],
      ["death", one.death],
    ] as const) {
      const added = lived(c, of(one.row), kind, date, newId);
      if (!added.ok) return added;
    }
  }

  const sources = new Map(table.links.map((link) => [link, newId("source")]));
  for (const [link, id] of sources) {
    const added = c.evidence.addSource({ id, kind: "site", title: link, repository: "", note: "" });
    if (!added.ok) return added;
  }
  for (const one of table.people) {
    const cited = cite(c, of(one.row), one, sources, newId);
    if (!cited.ok) return cited;
  }
  return { ok: true, value: told(previewOf(table, refused)) };
}

function coupleOf(a: number, b: number): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

function lived(
  c: Contexts,
  person: PersonId,
  kind: "birth" | "death",
  date: FuzzyDate | null,
  newId: NewId,
): Result<unknown, LifeError> {
  if (date === null) return { ok: true, value: null };
  return c.life.add({
    id: newId("event"),
    kind,
    title: "",
    date,
    place: null,
    participants: [{ person, role: "principal" }],
    union: null,
    main: true,
    certainty: "hypothesis",
    note: "",
  });
}

/** The link of a person stands behind the name they are known by; a person nobody named has none. */
function cite(
  c: Contexts,
  person: PersonId,
  { link, names }: TablePerson,
  sources: ReadonlyMap<string, Id<"source">>,
  newId: NewId,
): Result<unknown, EvidenceError> {
  const source = link === null ? undefined : sources.get(link);
  const [name] = names;
  if (source === undefined || name === undefined) return { ok: true, value: null };
  return c.evidence.cite({
    id: newId("citation"),
    source,
    fact: { subject: person, fact: `name:${name.id}` },
    page: "",
    quote: "",
  });
}
