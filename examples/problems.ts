import type { ExampleFamily } from "./family.ts";
import { kinOf } from "./kin.ts";

/** What is impossible or inconsistent in a family. */
export function problems(family: ExampleFamily): string[] {
  return [...brokenReferences(family), ...brokenFacts(family), ...brokenLives(family)];
}

type Facts = { id: string; certainty: string }[];

function factsOf({ people, parentages, unions, events }: ExampleFamily): Facts {
  return [...people.flatMap(({ names }) => names), ...parentages, ...unions, ...events];
}

function brokenReferences(family: ExampleFamily): string[] {
  const found: string[] = [];
  const { people, branches, parentages, unions, events, places, sources, citations } = family;
  const facts = factsOf(family);
  const lists: { id: string }[][] = [facts, people, branches, places, sources, citations];
  const records = lists.flat();
  if (new Set(records.map(({ id }) => id)).size !== records.length)
    found.push("an id is used twice");

  const refer = (list: { id: string }[]) => {
    const ids = new Set(list.map(({ id }) => id));
    return (from: string, to: string | null): void => {
      if (to !== null && !ids.has(to)) found.push(`${from} refers to ${to}`);
    };
  };
  const [toPerson, toUnion, toPlace] = [refer(people), refer(unions), refer(places)];
  const [toBranch, toSource, toFact] = [refer(branches), refer(sources), refer(facts)];
  toUnion("lastCouple", family.lastCouple);
  for (const { id, branch } of people) toBranch(id, branch);
  for (const { id, child, parent } of parentages) [child, parent].map((p) => toPerson(id, p));
  for (const { id, partners } of unions) {
    for (const person of partners) toPerson(id, person);
    if (partners[0] === partners[1]) found.push(`${id} is a union with oneself`);
  }
  for (const { id, place, union, participants } of events) {
    toPlace(id, place);
    toUnion(id, union);
    const ids = participants.map(({ person }) => person);
    for (const person of ids) toPerson(id, person);
    if (participants[0]?.role !== "principal") found.push(`${id} is about nobody`);
    if (new Set(ids).size !== ids.length) found.push(`${id} has somebody twice`);
  }
  for (const { id, source, fact } of citations) {
    toSource(id, source);
    toFact(id, fact);
  }
  const parentsOf = new Map<string, (string | null)[]>();
  for (const { child, parent } of parentages) {
    parentsOf.set(child, [...(parentsOf.get(child) ?? []), parent]);
  }
  const sexOf = new Map(people.map(({ id, sex }) => [id, sex]));
  for (const { id, participants } of events) {
    const godparents = participants.flatMap((p) => (p.role === "godparent" ? p.person : []));
    const parents = parentsOf.get(participants[0]?.person ?? "") ?? [];
    if (godparents.some((person) => parents.includes(person))) found.push(`${id}: own godparent`);
    if (new Set(godparents.map((person) => sexOf.get(person))).size !== godparents.length) {
      found.push(`${id} has two godparents of one sex`);
    }
  }
  return found;
}

function brokenFacts(family: ExampleFamily): string[] {
  const found: string[] = [];
  const cited = new Set(family.citations.map(({ fact }) => fact));
  for (const { id, certainty } of factsOf(family)) {
    if (certainty !== "hypothesis" && !cited.has(id)) {
      found.push(`${id} is ${certainty} without a citation`);
    }
  }
  const mainParents = new Map<string, number>();
  for (const { child, kind, main } of family.parentages) {
    if (kind === "blood" && main) mainParents.set(child, (mainParents.get(child) ?? 0) + 1);
  }
  for (const [id, count] of mainParents) {
    if (count > 2) found.push(`${id} has ${count} main blood parents`);
  }
  for (const { id, names } of family.people) {
    if (names.some(({ given, surname }) => given === null && surname === null)) {
      found.push(`${id} has an empty name`);
    }
    if (names.length > 0 && names[0]?.language !== "ru") found.push(`${id} is not shown in ru`);
  }

  // Every link counts for a cycle: versions and adoption as well as blood.
  const kin = kinOf(family);
  const done = new Set<string>();
  const open = new Set<string>();
  const visit = (id: string): void => {
    if (open.has(id)) found.push(`a cycle through ${id}`);
    if (open.has(id) || done.has(id)) return;
    open.add(id);
    kin.children(id).forEach(visit);
    open.delete(id);
    done.add(id);
  };
  for (const { id } of family.people) visit(id);
  return found;
}

function brokenLives(family: ExampleFamily): string[] {
  const found: string[] = [];
  const kin = kinOf(family);
  const years = (wanted: string): Map<string, number> =>
    new Map(
      family.events.flatMap(({ kind, main, date, participants }) => {
        const parsed = date?.parsed;
        const person = participants[0]?.person;
        return kind === wanted && main && parsed?.qualifier === "exact" && person !== undefined
          ? [[person, parsed.from.year] as const]
          : [];
      }),
    );
  const births = years("birth");
  const deaths = years("death");
  const died = new Set(
    family.events.flatMap((e) => (e.kind === "death" ? e.participants.map((p) => p.person) : [])),
  );
  for (const { id, living, sex } of family.people) {
    if (died.has(id) && living !== "no") found.push(`${id} is dead and living: ${living}`);
    const birth = births.get(id);
    const death = deaths.get(id);
    if (birth === undefined) continue;
    if (birth > 2025) found.push(`${id} is born in ${birth}`);
    if (death !== undefined && (death < birth || death > birth + 105)) {
      found.push(`${id} lived from ${birth} to ${death}`);
    }
    const children = kin.children(id).filter((child) => kin.parents(child).includes(id));
    const ages = children.flatMap((child) => births.get(child) ?? []).sort((a, b) => a - b);
    if (sex === "female" && ages.some((year, i) => i > 0 && year - (ages[i - 1] ?? 0) < 2)) {
      found.push(`${id} has children too close together`);
    }
    for (const child of children) {
      const born = births.get(child);
      if (born === undefined) continue;
      const age = born - birth;
      if (age < 17 || age > (sex === "female" ? 47 : 75)) {
        found.push(`${id} is ${age} when ${child} is born`);
      }
      if (death !== undefined && born > death) found.push(`${id} is dead when ${child} is born`);
    }
  }
  const left = new Map(
    family.events.flatMap(({ kind, participants, date }) => {
      const [person, from] = [participants[0]?.person, date?.parsed?.from.year];
      const exact = kind === "emigration" && date?.parsed?.qualifier === "exact";
      return exact && person !== undefined && from !== undefined ? [[person, from] as const] : [];
    }),
  );
  for (const { date, participants, id } of family.events) {
    const guests = participants.filter(({ role }) => role !== "principal");
    const at = date?.parsed?.qualifier === "exact" ? date.parsed.from.year : 0;
    for (const { person } of guests) {
      if (at > (left.get(person) ?? at)) found.push(`${person} is overseas before ${id}`);
    }
  }
  for (const { date, participants, main, id } of family.events) {
    if (date?.parsed?.qualifier !== "exact" || !main) continue;
    for (const { person } of participants) {
      const [birth, death] = [births.get(person), deaths.get(person)];
      const year = date.parsed.from.year;
      if (birth !== undefined && year < birth) found.push(`${person} is not born before ${id}`);
      if (death !== undefined && year > death) found.push(`${person} is dead before ${id}`);
    }
  }
  return found;
}
