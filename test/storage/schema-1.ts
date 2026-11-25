import type { ExampleFamily, FamilyEvent, FuzzyDate } from "../../examples/family.ts";
import { snapshotOf } from "../../examples/snapshot.ts";
import { anna, idOf } from "./tree";

/**
 * A database as schema 1 had it, with the example family in it. Its tables and the shape of its rows
 * are written by hand and frozen: code that comes later must open them. It uses no adapter and is not
 * changed with them. Who is in the family may change with the example.
 */
export const tables = [
  "CREATE TABLE history_schema (number INTEGER PRIMARY KEY)",
  `CREATE TABLE kinship_person (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE kinship_union (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE kinship_branch (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, members TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE places_place (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE evidence_source (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE evidence_subject (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE life_subject (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE history_entry (
    number INTEGER NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (number, part)
  ) WITHOUT ROWID`,
  "CREATE TABLE history_subject (id TEXT PRIMARY KEY, entries TEXT NOT NULL) WITHOUT ROWID",
  "CREATE TABLE history_trash (id TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID",
];

export type Row = { id: string; version: number; data: object };
export type Family = {
  people: Row[];
  unions: Row[];
  branches: (Row & { members: { people: string[]; unions: string[] } })[];
  places: Row[];
  sources: Row[];
  cited: Row[];
  lives: Row[];
};

export const personId = (id: string) => idOf("person", id);

export function rowsOf(family: ExampleFamily): Family {
  const snapshot = snapshotOf(family);
  const unionId = (id: string) => idOf("union", id);
  const eventId = (id: string) => idOf("event", id);
  const placeId = (id: string) => idOf("place", id);
  const someone = (id: string | null) => (id === null ? "unknown" : personId(id));
  const homeOf = ({ participants }: FamilyEvent) => participants[0]?.person ?? "";

  const parents = new Map(snapshot.people.map((one) => [one.id, one.parents]));
  const children = groupBy(
    family.parentages.filter(({ parent }) => parent !== null),
    ({ parent }) => parent ?? "",
  );
  const couples = new Map<string, string[]>();
  for (const { id, partners } of family.unions) {
    for (const one of partners) couples.set(one, [...(couples.get(one) ?? []), unionId(id)]);
  }

  const events = groupBy(family.events, homeOf);
  const elsewhere = new Map<string, object[]>();
  for (const event of family.events) {
    const home = homeOf(event);
    const others = new Set(event.participants.map(({ person }) => person));
    others.delete(home);
    for (const one of others) {
      const pointer = { event: eventId(event.id), home: personId(home) };
      elsewhere.set(one, [...(elsewhere.get(one) ?? []), pointer]);
    }
  }

  const subjects = new Map<string, { subject: string; fact: string }>();
  for (const { id, names } of family.people) {
    for (const name of names) {
      subjects.set(name.id, { subject: personId(id), fact: `name:${name.id}` });
    }
  }
  for (const { id, child } of family.parentages) {
    subjects.set(id, { subject: personId(child), fact: `parentage:${id}` });
  }
  for (const { id } of family.unions) subjects.set(id, { subject: unionId(id), fact: "union" });
  for (const event of family.events) {
    const fact = `event:${eventId(event.id)}`;
    subjects.set(event.id, { subject: personId(homeOf(event)), fact });
  }
  const citations = groupBy(
    family.citations,
    ({ fact }) => subjects.get(fact)?.subject ?? `no ${fact}`,
  );
  const row = (id: string, data: object): Row => ({ id, version: 1, data });

  return {
    people: family.people.map(({ id, sex, living, names }) =>
      row(personId(id), {
        sex,
        living,
        names: names.map((name) => ({
          ...name,
          given: name.given ?? "",
          patronymic: name.patronymic ?? "",
          surname: name.surname ?? "",
        })),
        mainName: names[0]?.id ?? null,
        parents: (parents.get(id) ?? []).map((link) => ({
          id: link.id,
          parent: someone(link.parent),
          union: link.union === null ? null : unionId(link.union),
          kind: link.kind,
          main: link.main,
          certainty: link.certainty,
        })),
        children: [...new Set((children.get(id) ?? []).map(({ child }) => personId(child)))],
        unions: couples.get(id) ?? [],
        childOrder: [],
      }),
    ),
    unions: family.unions.map(({ id, kind, partners, certainty }) =>
      row(unionId(id), { partners: partners.map(personId), kind, certainty }),
    ),
    branches: family.branches.map(({ id, name, color }) => ({
      ...row(idOf("branch", id), { title: { ru: name.ru, en: name.en }, color: color - 1 }),
      members: {
        people: family.people.filter(({ branch }) => branch === id).map((one) => personId(one.id)),
        unions: [],
      },
    })),
    places: family.places.map(({ id, names, affiliations }) =>
      row(placeId(id), {
        names: names.map(({ text, language, from, to }) => ({
          text,
          language,
          period: periodOf(from, to),
        })),
        affiliations: affiliations.map(({ name, from, to }) => ({
          name: name.ru,
          period: periodOf(from, to),
        })),
        coordinates: null,
      }),
    ),
    sources: family.sources.map(({ id, kind, title }) =>
      row(idOf("source", id), {
        kind: kind === "story" ? "story" : kind === "photo" ? "other" : "document",
        title,
        repository: "",
        note: "",
      }),
    ),
    cited: [...citations].map(([subject, list]) =>
      row(subject, {
        citations: list.map(({ id, source, fact, detail }) => ({
          id: idOf("citation", id),
          source: idOf("source", source),
          fact: subjects.get(fact),
          page: detail,
          quote: "",
        })),
      }),
    ),
    lives: family.people
      .filter(({ id }) => events.has(id) || elsewhere.has(id))
      .map(({ id }) =>
        row(personId(id), {
          events: (events.get(id) ?? []).map((event) => ({
            id: eventId(event.id),
            kind: event.kind,
            title: "",
            date: dateOf(event.date),
            place: event.place === null ? null : placeId(event.place),
            participants: event.participants.map(({ person, role }) => ({
              person: personId(person),
              role,
            })),
            union: event.union === null ? null : unionId(event.union),
            main: event.main,
            certainty: event.certainty,
            note: "",
          })),
          takesPart: elsewhere.get(id) ?? [],
        }),
      ),
  };
}

/** Puts a family into the tables of schema 1. */
export function fill(sql: SqlStorage, family: Family): void {
  const put = (query: string, rows: Row[]) => {
    for (const { id, version, data } of rows) sql.exec(query, id, version, JSON.stringify(data));
  };
  put("INSERT INTO kinship_person (id, version, data) VALUES (?, ?, ?)", family.people);
  put("INSERT INTO kinship_union (id, version, data) VALUES (?, ?, ?)", family.unions);
  put("INSERT INTO places_place (id, version, data) VALUES (?, ?, ?)", family.places);
  put("INSERT INTO evidence_source (id, version, data) VALUES (?, ?, ?)", family.sources);
  put("INSERT INTO evidence_subject (id, version, data) VALUES (?, ?, ?)", family.cited);
  put("INSERT INTO life_subject (id, version, data) VALUES (?, ?, ?)", family.lives);
  for (const { id, version, data, members } of family.branches) {
    sql.exec(
      "INSERT INTO kinship_branch (id, version, data, members) VALUES (?, ?, ?, ?)",
      id,
      version,
      JSON.stringify(data),
      JSON.stringify(members),
    );
  }
  const subject = family.people[0]?.id ?? "";
  for (const [part, patches] of entry(subject).entries()) {
    const data = { at: 1_800_000_000_000, by: anna, scenario: "import", patches };
    sql.exec(
      "INSERT INTO history_entry (number, part, data) VALUES (1, ?, ?)",
      part,
      JSON.stringify(data),
    );
  }
  sql.exec("INSERT INTO history_subject (id, entries) VALUES (?, ?)", subject, "[1]");
}

/** The patches of an entry, by its parts. */
export function entry(subject: string): object[][] {
  const aggregate = `person/${subject}`;
  return [
    [
      { aggregate, path: "", before: null, after: { names: [{ id: "n1", given: "Верес" }] } },
      { aggregate, path: "sex", before: "unknown", after: "male" },
    ],
    [
      { aggregate, path: "names/n1/given", before: "Дуб", after: "Верес" },
      { aggregate, path: "names/n2", before: { id: "n2" }, after: null },
      { aggregate, path: "names/", before: ["n2", "n1"], after: ["n1"] },
      {
        aggregate: `person-branch/${subject}`,
        path: "",
        before: null,
        after: idOf("branch", "b1"),
      },
    ],
  ];
}

function dateOf(date: FuzzyDate | null): object | null {
  if (date === null) return null;
  if (date.parsed === null) return { text: date.text, parsed: null };
  const { qualifier, calendar, from, to } = date.parsed;
  return {
    text: date.text,
    parsed: { qualifier, calendar, from, ...(to === null ? {} : { to }) },
  };
}

function periodOf(from: number | null, to: number | null): object {
  const year = (at: number | null) =>
    at === null
      ? null
      : {
          text: String(at),
          parsed: { qualifier: "exact", calendar: "gregorian", from: { year: at } },
        };
  return { from: year(from), to: year(to) };
}

function groupBy<T>(list: readonly T[], keyOf: (one: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const one of list) {
    const group = groups.get(keyOf(one));
    if (group === undefined) groups.set(keyOf(one), [one]);
    else group.push(one);
  }
  return groups;
}
