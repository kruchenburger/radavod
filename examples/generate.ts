import { dateIn, soonAfter, yearDate } from "./dates.ts";
import type {
  Certainty,
  Citation,
  ExampleFamily,
  FamilyEvent,
  Language,
  NameForm,
  Parentage,
  Person,
  Script,
  SourceKind,
  Union,
} from "./family.ts";
import {
  branches,
  nicknames,
  places,
  port,
  sources,
  town,
  type Tradition,
  unparsedDates,
} from "./names.ts";
import { type Random, randomFrom } from "./random.ts";
import { type Draft, type DraftUnion, growTree, thisYear, type Tree } from "./tree.ts";

/** An invented family. The same seed and size give the same family on every machine. */
export function generateFamily(seed: number, size: number): ExampleFamily {
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32) {
    throw new RangeError("the seed is a whole number from 0 to 2^32 - 1");
  }
  if (!Number.isInteger(size)) throw new RangeError("the size is a whole number");
  const random = randomFrom(seed);
  return new Chronicle(random, growTree(random, size)).write();
}

type Life = { death: number | null; deathIsKnown: boolean; living: Person["living"] };

function lifeOf(random: Random, person: Draft): Life {
  const { int, chance } = random;
  const diesYoung = !person.settled && chance(0.12);
  const span = diesYoung ? int(0, 12) : int(48, 92);
  const death = person.death ?? Math.max(person.birth + span, person.aliveIn + int(0, 3));
  if (death >= thisYear) {
    return { death: null, deathIsKnown: false, living: chance(0.93) ? "yes" : "unknown" };
  }
  // Nothing says the person is dead, though nobody lives that long.
  if (person.death === null && chance(0.12)) {
    return { death, deathIsKnown: false, living: "unknown" };
  }
  return { death, deathIsKnown: person.death !== null || chance(0.9), living: "no" };
}

/** What a fact is about: decides which sources may name it. */
type Subject = {
  year: number;
  tradition: Tradition;
  event?: FamilyEvent["kind"];
  /** The certainty the fact must have. */
  wanted?: Certainty | null;
};

function subjectOf({ birth, surname }: Draft): Subject {
  return { year: birth, tradition: surname.tradition };
}

type Participants = FamilyEvent["participants"];

type Details = Pick<FamilyEvent, "date" | "place" | "participants"> & {
  union?: string;
  main?: boolean;
};

const languageOf = { orthodox: "be", catholic: "pl", lithuanian: "lt", jewish: "yi" } as const;

const scriptOf = (language: Language): Script =>
  language === "yi" ? "Hebr" : language === "ru" || language === "be" ? "Cyrl" : "Latn";

/** Turns drafts into records with identifiers, names, events and citations. */
class Chronicle {
  readonly #random: Random;
  readonly #tree: Tree;
  readonly #lives: Map<Draft, Life>;
  readonly #ids: Map<Draft, string>;
  readonly #unionIds: Map<DraftUnion, string>;
  readonly #citations: Citation[] = [];
  readonly #events: FamilyEvent[] = [];
  #nameCount = 0;
  #citationCount = 0;

  constructor(random: Random, tree: Tree) {
    this.#random = random;
    this.#tree = tree;
    this.#lives = new Map(tree.people.map((person) => [person, lifeOf(random, person)]));
    this.#ids = new Map(tree.people.map((person, i) => [person, `p${i + 1}`]));
    this.#unionIds = new Map(tree.unions.map((union, i) => [union, `u${i + 1}`]));
  }

  write(): ExampleFamily {
    const { people, unions, links, lastCouple } = this.#tree;
    return {
      branches: branches.map(({ name }, i) => ({
        id: `b${i + 1}`,
        name: { ...name },
        color: i + 1,
      })),
      people: people.map((person) => this.#person(person)),
      parentages: links.map((link, i): Parentage => {
        const { child, parent, kind, main } = link;
        const id = `k${i + 1}`;
        const wanted = parent === null ? "unresolved" : link.certainty;
        const certainty = this.#certainty(id, { ...subjectOf(child), wanted });
        const parentId = parent === null ? null : this.#id(parent);
        return { id, child: this.#id(child), parent: parentId, kind, main, certainty };
      }),
      unions: unions.map((union): Union => {
        const id = this.#unionId(union);
        const [husband, wife] = union.partners;
        const certainty = this.#certainty(id, { ...subjectOf(wife), year: union.year });
        return { id, kind: union.kind, partners: [this.#id(husband), this.#id(wife)], certainty };
      }),
      lastCouple: this.#unionId(lastCouple),
      events: this.#writeEvents(),
      places: places.map(({ names, affiliations }, i) => ({
        id: `l${i + 1}`,
        names: names.map((name) => ({ ...name })),
        affiliations: affiliations.map((period) => ({ ...period, name: { ...period.name } })),
        coordinates: null,
      })),
      sources: sources.map(({ kind, title }, i) => ({ id: `s${i + 1}`, kind, title })),
      citations: this.#citations,
    };
  }

  #id(person: Draft): string {
    return this.#ids.get(person) as string;
  }

  #unionId(union: DraftUnion): string {
    return this.#unionIds.get(union) as string;
  }

  #life(person: Draft): Life {
    return this.#lives.get(person) as Life;
  }

  #person(person: Draft): Person {
    return {
      id: this.#id(person),
      sex: person.sex,
      living: this.#life(person).living,
      branch: person.branch === null ? null : `b${person.branch + 1}`,
      names: this.#names(person),
    };
  }

  #names(person: Draft): NameForm[] {
    const { given, surname, birth, fatherGiven } = person;
    const { chance, pick } = this.#random;
    if (given === null) return [];

    const forms: NameForm[] = [];
    const write = (
      kind: NameForm["kind"],
      language: Language,
      parts: { given?: string | undefined; patronymic?: string; surname?: string | undefined },
    ): void => {
      this.#nameCount += 1;
      const id = `n${this.#nameCount}`;
      const script = scriptOf(language);
      const certainty = chance(0.3) ? this.#certainty(id, subjectOf(person)) : "hypothesis";
      const { given = null, patronymic = null, surname = null } = parts;
      forms.push({ id, kind, language, script, given, patronymic, surname, certainty });
    };

    const isWoman = person.sex === "female";
    const form = isWoman ? 1 : 0;
    const ru = fatherGiven === null ? {} : { patronymic: fatherGiven.patronymic.ru[form] };
    const be = fatherGiven === null ? {} : { patronymic: fatherGiven.patronymic.be[form] };
    const own = languageOf[surname.tradition];
    write("birth", "ru", { given: given.ru, ...ru, surname: surname.ru[form] });
    if (own === "be") write("birth", "be", { given: given.be, ...be, surname: surname.be[form] });
    if (own === "pl") write("birth", "pl", { given: given.pl, surname: surname.pl?.[form] });
    if (own === "yi") write("birth", "yi", { given: given.yi, surname: surname.yi });
    if (own === "lt") {
      const spelling = isWoman ? surname.lt?.maiden : surname.lt?.male;
      write("birth", "lt", { given: given.lt, surname: spelling });
    }
    if ((own === "pl" || own === "lt") && birth < 1900) {
      write("church", "la", { given: given.la, surname: surname.pl?.[form] });
    }
    for (const { partners, kind } of this.#tree.unions) {
      const [husband, wife] = partners;
      if (wife !== person || kind !== "marriage") continue;
      const taken = husband.surname;
      write("married", "ru", { given: given.ru, ...ru, surname: taken.ru[1] });
      if (taken.lt !== undefined && given.lt !== undefined) {
        write("married", "lt", { given: given.lt, surname: taken.lt.married });
      }
    }
    if (!isWoman && birth < 1910 && chance(0.12)) {
      write("variant", "ru", { given: oldSpelling(given.ru), surname: oldSpelling(surname.ru[0]) });
    }
    if (this.#leaves(person))
      write("variant", "en", { given: given.en, surname: surname.en[form] });
    if (chance(0.06)) write("nickname", "ru", { given: pick(nicknames) });
    return forms;
  }

  /** Some of the unmarried went overseas. */
  #leaves(person: Draft): boolean {
    const { death } = this.#life(person);
    const isGrown = death === null || death > person.birth + 30;
    const years = person.birth >= 1870 && person.birth <= 1908;
    return years && isGrown && !person.settled && Number(this.#id(person).slice(1)) % 2 === 0;
  }

  #writeEvents(): FamilyEvent[] {
    for (const person of this.#tree.people) this.#writeLife(person);
    for (const union of this.#tree.unions) this.#writeUnion(union);
    this.#addVersions();
    this.#forgetDates();
    return this.#events;
  }

  #writeLife(person: Draft): void {
    const { chance, int, pick } = this.#random;
    const { birth } = person;
    const { death, deathIsKnown } = this.#life(person);
    const subject = subjectOf(person);
    const home = this.#home(person);
    const self: Participants = [{ person: this.#id(person), role: "principal" }];

    const born = death === birth ? yearDate(birth) : dateIn(this.#random, birth);
    this.#event("birth", subject, { date: born, place: home, participants: self });

    if (subject.tradition !== "jewish" && birth < 1918 && chance(0.35)) {
      const { friend } = this.#tree;
      const guests = this.#guests(person, birth);
      const knows = birth > friend.birth + 18 && birth < friend.birth + 60;
      if (knows && chance(0.4)) guests.unshift(this.#id(friend));
      const godparents = guests
        .slice(0, 2)
        .map((id) => ({ person: id, role: "godparent" as const }));
      const date = soonAfter(this.#random, born);
      this.#event("baptism", subject, {
        date,
        place: home,
        participants: [...self, ...godparents],
      });
    }
    if (this.#leaves(person)) {
      const year = birth + int(18, 27);
      const date = dateIn(this.#random, year);
      const place = placeId(port);
      this.#event("emigration", { ...subject, year }, { date, place, participants: self });
    }
    if (death !== null && deathIsKnown) {
      const dying = { ...subject, year: death };
      const died = death === birth ? yearDate(death) : dateIn(this.#random, death);
      const place = chance(0.7) ? home : pick([placeId(town), null]);
      this.#event("death", dying, { date: died, place, participants: self });
      if (chance(0.25)) {
        const date = soonAfter(this.#random, died);
        this.#event("burial", dying, { date, place, participants: self });
      }
    }
  }

  #writeUnion(union: DraftUnion): void {
    if (union.kind !== "marriage") return;
    const { chance } = this.#random;
    const [, wife] = union.partners;
    const id = this.#unionId(union);
    const subject = subjectOf(wife);
    const participants: Participants = union.partners.map((partner) => ({
      person: this.#id(partner),
      role: "principal",
    }));
    if (chance(0.8)) {
      const date = dateIn(this.#random, union.year);
      const place = this.#home(wife);
      const guests = chance(0.2) ? this.#guests(wife, union.year, union) : [];
      const all = [
        ...participants,
        ...guests.map((p) => ({ person: p, role: "witness" as const })),
      ];
      const year = { ...subject, year: union.year };
      this.#event("wedding", year, { date, place, participants: all, union: id });
    }
    if (union.divorce !== null) {
      const date = dateIn(this.#random, union.divorce);
      const place = placeId(town);
      const year = { ...subject, year: union.divorce };
      this.#event("divorce", year, { date, place, participants, union: id });
    }
  }

  /** Two grown-ups alive that year, other than those the day is about. */
  #guests(person: Draft, year: number, union?: DraftUnion): string[] {
    const able = this.#tree.people.filter((guest) => {
      const { death } = this.#life(guest);
      const isAdult = guest.birth + 18 <= year && guest.birth + 60 > year && guest.given !== null;
      const isHost = guest === person || guest === this.#tree.friend;
      const isAlive = death === null || death > year;
      return isAdult && isAlive && !isHost && !union?.partners.includes(guest);
    });
    if (able.length === 0) return [];
    return [...new Set([this.#random.pick(able), this.#random.pick(able)])].map((p) => this.#id(p));
  }

  /** The place of the branch; the last two generations live in the town. */
  #home(person: Draft): string {
    const last = this.#tree.lastCouple.partners[0].generation;
    if (person.generation >= last - 1) return placeId(town);
    return placeId(person.branch ?? this.#random.int(0, branches.length - 1));
  }

  #event(kind: FamilyEvent["kind"], subject: Subject, details: Details): void {
    const { date, place, participants, union = null, main = true } = details;
    const id = `e${this.#events.length + 1}`;
    this.#events.push({
      id,
      kind,
      date,
      place,
      union,
      main,
      participants: participants.map((participant) => ({ ...participant })),
      certainty: this.#certainty(id, { ...subject, event: kind }),
    });
  }

  /** A second version of a birth and of a death. Both versions contradict each other. */
  #addVersions(): void {
    for (const kind of ["birth", "death"] as const) {
      const first = this.#events.find(
        (event) => event.kind === kind && event.date?.parsed?.qualifier === "exact",
      );
      const year = first?.date?.parsed?.from.year;
      if (first === undefined || year === undefined) throw new Error(`no exact date of a ${kind}`);
      const subject: Subject = { year, tradition: "orthodox", wanted: "contradiction" };
      const others = this.#citations.filter(({ fact }) => fact !== first.id);
      this.#citations.splice(0, this.#citations.length, ...others);
      first.certainty = this.#certainty(first.id, subject);
      const { place, participants } = first;
      const date = yearDate(kind === "birth" ? year - 1 : year + 1);
      this.#event(kind, subject, { date, place, participants, main: false });
    }
  }

  /** Some sources date an event by what people remembered instead of a year. */
  #forgetDates(): void {
    const vague = this.#events.filter(
      ({ kind, date, main }) => main && kind === "death" && date?.parsed?.qualifier !== "exact",
    );
    unparsedDates.forEach((text, i) => {
      const event = vague[i];
      if (event !== undefined) event.date = { text, parsed: null };
    });
  }

  /** The certainty of a fact, with the citations it needs. */
  #certainty(fact: string, { year, tradition, event, wanted }: Subject): Certainty {
    const { int, pick, weighted } = this.#random;
    const certainty =
      wanted ??
      weighted<Certainty>([
        ["hypothesis", 30],
        ["one-source", 47],
        ["confirmed", 13],
        ["contradiction", 5],
        ["unresolved", 5],
      ]);
    if (certainty === "hypothesis") return certainty;

    const needed = certainty === "confirmed" || certainty === "contradiction" ? 2 : 1;
    const fitting = sources.filter(
      ({ from, to, about, of }) =>
        year >= from &&
        year <= to &&
        (about === undefined || about === event) &&
        (of === undefined || of.includes(tradition)),
    );
    // A fact that must have this certainty is at least told about.
    const left =
      fitting.length >= needed ? fitting : wanted ? sources.filter((s) => s.kind === "story") : [];
    if (left.length < needed) return "hypothesis";
    for (let i = 0; i < needed; i += 1) {
      const source = pick(left);
      left.splice(left.indexOf(source), 1);
      this.#citationCount += 1;
      this.#citations.push({
        id: `c${this.#citationCount}`,
        source: `s${sources.indexOf(source) + 1}`,
        fact,
        detail: detailIn(source.kind, int(1, 90)),
      });
    }
    return certainty;
  }
}

function placeId(index: number): string {
  return `l${index + 1}`;
}

/** Until 1918 a word ending in a consonant took a hard sign. */
function oldSpelling(word: string): string {
  return /[бвгджзклмнпрстфхцчшщ]$/.test(word) ? `${word}ъ` : word;
}

function detailIn(kind: SourceKind, number: number): string {
  switch (kind) {
    case "register":
      return `запись ${number}`;
    case "census":
      return `двор ${number}`;
    case "document":
      return `страница ${number}`;
    case "photo":
      return `снимок ${number}`;
    case "story":
      return `минута ${number}`;
  }
}
