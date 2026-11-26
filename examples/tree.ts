import type { Certainty, Parentage, Union } from "./family.ts";
import {
  branches,
  type Given,
  givenNames,
  type MaleGiven,
  otherSurnames,
  type Surname,
} from "./names.ts";
import type { Random } from "./random.ts";

/** The year the family is described in. A fixed number, so the family never grows older. */
export const thisYear = 2026;

export type Sex = "male" | "female" | "unknown";

export type Draft = {
  generation: number;
  sex: Sex;
  branch: number | null;
  surname: Surname;
  /** Null for a person nobody named. */
  given: Given | null;
  /** The given name of the father, which a patronymic is made of. */
  fatherGiven: MaleGiven | null;
  birth: number;
  /** Set when the tree needs the person to be dead by then. */
  death: number | null;
  /** The last year the person has to be alive in. */
  aliveIn: number;
  /** Has a place in the tree already, so it gets no partner at random. */
  settled: boolean;
};

export type DraftUnion = {
  partners: [husband: Draft, wife: Draft];
  kind: Union["kind"];
  year: number;
  divorce: number | null;
  children: Draft[];
  /** Over: no more children. */
  closed: boolean;
};

export type DraftLink = {
  child: Draft;
  parent: Draft | null;
  kind: Parentage["kind"];
  main: boolean;
  certainty: Certainty | null;
};

export type Tree = {
  people: Draft[];
  unions: DraftUnion[];
  links: DraftLink[];
  lastCouple: DraftUnion;
  /** Knows the family and is kin to nobody in it. */
  friend: Draft;
};

/** Years between generations of the direct line. */
const step = 29;

/**
 * Ten founder lines that marry pair by pair into one last couple, then the hard cases, then
 * relatives until the tree has `size` people.
 */
export function growTree(random: Random, size: number): Tree {
  const { int, chance, pick } = random;
  const last = size > 1000 ? 8 : 6;
  const birthIn = (generation: number): number => 1990 - (last - generation) * step;

  const people: Draft[] = [];
  const unions: DraftUnion[] = [];
  const links: DraftLink[] = [];

  function add(
    draft: Pick<Draft, "generation" | "sex" | "branch" | "surname" | "birth"> & Partial<Draft>,
  ): Draft {
    const names = givenNames(draft.surname.tradition);
    const person: Draft = {
      given: pick(draft.sex === "female" ? names.female : names.male),
      fatherGiven: pick(names.male),
      death: null,
      aliveIn: draft.birth,
      settled: false,
      ...draft,
    };
    people.push(person);
    return person;
  }

  function link(child: Draft, parent: Draft | null, kind: Parentage["kind"] = "blood"): DraftLink {
    const made: DraftLink = { child, parent, kind, main: true, certainty: null };
    links.push(made);
    return made;
  }

  const unionsOf = (person: Draft): DraftUnion[] =>
    unions.filter(({ partners }) => partners.includes(person));

  function couple(husband: Draft, wife: Draft, year: number, kind: Union["kind"]): DraftUnion {
    const union: DraftUnion = {
      partners: [husband, wife],
      kind,
      year,
      divorce: null,
      children: [],
      closed: false,
    };
    unions.push(union);
    for (const partner of union.partners) {
      partner.settled = true;
      partner.aliveIn = Math.max(partner.aliveIn, year);
    }
    return union;
  }

  /** The earliest year a person can enter the next union, after the previous ones ended. */
  function endUnions(person: Draft): number {
    let free = 0;
    for (const union of unionsOf(person).filter(({ closed }) => !closed)) {
      const ended = Math.max(union.year, ...union.children.map(({ birth }) => birth)) + int(1, 4);
      const [other] = union.partners.filter((partner) => partner !== person);
      if (union.year > 1945) union.divorce = ended;
      else if (other !== undefined) other.death = Math.max(ended, other.aliveIn);
      union.closed = true;
      free = Math.max(free, ended, other?.death ?? 0);
    }
    return free;
  }

  /** Marries a person to another one, or to somebody new from outside the branches. */
  function marry(person: Draft, other?: Draft, kind: Union["kind"] = "marriage"): DraftUnion {
    const free = Math.max(endUnions(person), other === undefined ? 0 : endUnions(other)) + 1;
    const ready = (p: Draft): number => p.birth + (p.sex === "male" ? int(21, 25) : int(18, 22));
    const year = Math.max(free, ready(person), other === undefined ? 0 : ready(other));
    const partner = other ?? spouseFor(person, year);
    return person.sex === "male"
      ? couple(person, partner, year, kind)
      : couple(partner, person, year, kind);
  }

  function spouseFor(person: Draft, year: number): Draft {
    const own = person.surname.tradition;
    return add({
      generation: person.generation,
      sex: person.sex === "male" ? "female" : "male",
      branch: null,
      surname: pick(otherSurnames.filter(({ tradition }) => tradition === own)),
      birth: year - (person.sex === "male" ? int(19, 24) : int(22, 28)),
    });
  }

  const nextBirth = ({ year, children }: DraftUnion): number => {
    const last = children.at(-1);
    return last === undefined ? year + int(1, 3) : last.birth + int(2, 3);
  };

  const canBear = (union: DraftUnion): boolean => {
    const latest = (union.children.at(-1)?.birth ?? union.year) + 3;
    const [husband, wife] = union.partners;
    return (
      !union.closed &&
      latest <= Math.min(wife.birth + 44, husband.birth + 65, 2020) &&
      Math.max(husband.generation, wife.generation) < last
    );
  };

  function bear(union: DraftUnion, options: Partial<Draft> = {}): Draft {
    const [husband, wife] = union.partners;
    const sex = options.sex ?? (chance(0.5) ? "male" : "female");
    const names = givenNames(husband.surname.tradition);
    const pool = sex === "female" ? names.female : names.male;
    const free = pool.filter((name) => union.children.every(({ given }) => given?.ru !== name.ru));
    const child = add({
      generation: Math.max(husband.generation, wife.generation) + 1,
      branch: husband.branch ?? wife.branch,
      surname: husband.surname,
      given: pick(free.length > 0 ? free : pool),
      fatherGiven: husband.given as MaleGiven,
      birth: nextBirth(union),
      ...options,
      sex,
    });
    union.children.push(child);
    husband.aliveIn = Math.max(husband.aliveIn, child.birth);
    wife.aliveIn = Math.max(wife.aliveIn, child.birth);
    link(child, husband);
    link(child, wife);
    return child;
  }

  /** The person of the direct line in a generation whose ancestors are the given branches. */
  function direct(lines: number[], generation: number, sex: Sex): Draft {
    const siblings = int(1, 2);
    const place = int(0, siblings);
    const births: number[] = [birthIn(generation) + int(-2, 2)];
    for (let i = place; i > 0; i -= 1) births.unshift((births[0] as number) - int(2, 3));
    for (let i = place; i < siblings; i += 1) births.push((births.at(-1) as number) + int(2, 3));
    const year = (births[0] as number) - 1;

    const [line] = lines;
    let union: DraftUnion;
    if (lines.length > 1 || line === undefined) {
      const half = Math.ceil(lines.length / 2);
      const husband = direct(lines.slice(0, half), generation - 1, "male");
      union = couple(
        husband,
        direct(lines.slice(half), generation - 1, "female"),
        year,
        "marriage",
      );
    } else {
      // Some founders belong to the second generation.
      const isFounder = generation === 1 || (generation === 2 && line % 3 === 1);
      const home = branches[line];
      if (home === undefined) throw new Error(`no branch ${line}`);
      const husband = isFounder
        ? add({
            generation: generation - 1,
            sex: "male",
            branch: line,
            surname: home.surname,
            birth: birthIn(generation - 1) + int(-2, 2),
          })
        : direct(lines, generation - 1, "male");
      union = couple(husband, spouseFor(husband, year), year, "marriage");
    }
    let chosen: Draft | undefined;
    births.forEach((birth, i) => {
      const child = bear(union, i === place ? { birth, sex, settled: true } : { birth });
      if (i === place) chosen = child;
    });
    return chosen as Draft;
  }

  const left = direct([0, 1, 2, 3, 4], last, "male");
  const right = direct([5, 6, 7, 8, 9], last, "female");
  const lastCouple = couple(left, right, birthIn(last) + 28, "marriage");
  lastCouple.closed = true;

  type Wanted = { generation: number; branch: number; sex: Sex };

  /** An unmarried person of a branch and a generation, born into the tree when there is none. */
  function find({ generation, branch, sex }: Wanted): Draft {
    const found = people.find(
      (p) => !p.settled && p.generation === generation && p.branch === branch && p.sex === sex,
    );
    if (found !== undefined) return found;
    const open = unions.filter((union) => {
      const [husband, wife] = union.partners;
      const below = Math.max(husband.generation, wife.generation) + 1;
      return (husband.branch ?? wife.branch) === branch && below <= generation && canBear(union);
    });
    const depth = (union: DraftUnion): number =>
      Math.max(...union.partners.map((partner) => partner.generation));
    const deepest = Math.max(...open.map(depth));
    let union = open.find((candidate) => depth(candidate) === deepest);
    if (union === undefined) throw new Error(`branch ${branch} has no room for a child`);
    for (let g = deepest + 1; g < generation; g += 1) {
      union = marry(bear(union, { sex: "male", settled: true }));
    }
    return bear(union, { sex });
  }

  addHardCases();

  function addHardCases(): void {
    // Three unions with children in each, so there are half-siblings.
    const thrice = find({ generation: 2, branch: 2, sex: "male" });
    for (const count of [2, 1, 2]) {
      const union = marry(thrice);
      for (let i = 0; i < count; i += 1) bear(union);
    }

    // A mother alone; the father is known to nobody.
    const mother = find({ generation: 3, branch: 5, sex: "female" });
    mother.settled = true;
    const fatherless = add({
      generation: 4,
      sex: "male",
      branch: mother.branch,
      surname: mother.surname,
      fatherGiven: null,
      birth: mother.birth + int(19, 24),
    });
    mother.aliveIn = fatherless.birth;
    link(fatherless, mother);
    link(fatherless, null);
    bear(marry(fatherless), { sex: "female" });

    // A marriage across branches away from the direct line.
    const across = marry(
      find({ generation: 2, branch: 1, sex: "male" }),
      find({ generation: 2, branch: 7, sex: "female" }),
    );
    bear(across);
    if (canBear(across)) bear(across);

    // Cousins marry, so their children reach the same ancestors by two lines.
    const uncle = find({ generation: 2, branch: 4, sex: "male" });
    const family = unions.find(({ children }) => children.includes(uncle)) as DraftUnion;
    const aunt = bear(family, { sex: "female" });
    const cousin = bear(marry(uncle), { sex: "male" });
    const cousins = marry(cousin, bear(marry(aunt), { sex: "female" }));
    bear(cousins);

    // Adoption: the blood parents are known too.
    const adopted = bear(marry(find({ generation: 3, branch: 8, sex: "male" })));
    const adoptive = marry(find({ generation: 3, branch: 8, sex: "female" }));
    for (const partner of adoptive.partners) {
      link(adopted, partner, "adoption");
      partner.aliveIn = Math.max(partner.aliveIn, adopted.birth + 1);
    }

    // Spouses of two generations.
    const older = find({ generation: 2, branch: 3, sex: "male" });
    bear(marry(older, find({ generation: 3, branch: 6, sex: "female" })));

    // A widower marries the sister of his late wife.
    const widower = find({ generation: 3, branch: 0, sex: "male" });
    const wife = find({ generation: 3, branch: 7, sex: "female" });
    const home = unions.find(({ children }) => children.includes(wife)) as DraftUnion;
    wife.settled = true;
    const sister = bear(home, { sex: "female", settled: true });
    bear(marry(widower, wife));
    bear(marry(widower, sister));

    // A widow marries a younger man, who after her death marries again. Never her daughter: that
    // happens, and the layout manages it (test/web/layout/cases.ts), but here it reads as a mistake.
    const widow = find({ generation: 2, branch: 3, sex: "female" });
    bear(marry(widow), { sex: "female" });
    const young = spouseFor(widow, widow.birth + 33);
    couple(young, widow, Math.max(endUnions(widow) + 1, young.birth + 22), "marriage");
    young.settled = true;
    bear(marry(young), { sex: "female" });

    // Two versions of a father: the second one is a neighbor of his generation.
    const disputed = bear(marry(find({ generation: 3, branch: 4, sex: "male" })));
    const neighbor = find({ generation: 3, branch: 5, sex: "male" });
    neighbor.settled = true;
    const [main] = links.filter(({ child }) => child === disputed);
    if (main !== undefined) main.certainty = "contradiction";
    Object.assign(link(disputed, neighbor), { main: false, certainty: "contradiction" });

    // Eight siblings, none with a family of their own.
    const row = marry(find({ generation: 3, branch: 8, sex: "male" }));
    for (let i = 0; i < 8; i += 1) {
      bear(row, { birth: row.year + 1 + 2 * i, settled: true });
    }
    row.closed = true;

    // A child who died before anybody wrote down a name.
    const unnamed = bear(marry(find({ generation: 1, branch: 9, sex: "male" })), {
      sex: "unknown",
      given: null,
      settled: true,
    });
    unnamed.death = unnamed.birth;

    // A ward, and a child a census lists in a household without a word about kinship.
    const ward = add({
      generation: 4,
      sex: "female",
      branch: null,
      surname: pick(otherSurnames),
      birth: birthIn(4) + int(0, 5),
    });
    const guardian = find({ generation: 3, branch: 2, sex: "male" });
    link(ward, guardian, "guardianship");
    guardian.settled = true;
    guardian.aliveIn = Math.max(guardian.aliveIn, ward.birth);
    const listed = add({
      generation: 3,
      sex: "male",
      branch: null,
      surname: pick(otherSurnames),
      birth: birthIn(3) + int(0, 5),
    });
    link(listed, older, "unknown");
    older.aliveIn = Math.max(older.aliveIn, listed.birth);
    ward.settled = true;
    listed.settled = true;

    bear(marry(find({ generation: 1, branch: 6, sex: "male" }), undefined, "unknown"));
  }

  const friend = add({
    generation: 2,
    sex: "male",
    branch: null,
    surname: pick(otherSurnames.filter(({ tradition }) => tradition === "orthodox")),
    birth: birthIn(2) + int(0, 5),
    settled: true,
  });
  friend.aliveIn = friend.birth + 60;

  if (people.length > size) throw new RangeError(`a family needs at least ${people.length} people`);

  // Remarriages, then one generation after another, until the tree is full.
  const unmarried = (generation: number): Draft[] =>
    people.filter(
      (p) => !p.settled && p.branch !== null && p.generation === generation && p.birth < 1992,
    );
  const room = (): number => size - people.length;
  const raise = (person: Draft, kind: Union["kind"], children: number): void => {
    const union = marry(person, undefined, kind);
    for (let i = 0; i < children && room() > 0 && canBear(union); i += 1) bear(union);
  };
  const kindFor = (person: Draft): Union["kind"] =>
    person.birth > 1900 && chance(0.2) ? "civil" : "marriage";

  let again = Math.round(size / 60);
  for (let generation = 0; room() > 0; generation = (generation + 1) % last) {
    const candidates = Array.from({ length: last }, (_, i) => (generation + i) % last)
      .map(unmarried)
      .find((list) => list.length > 0);
    if (candidates !== undefined && room() > 1) {
      const person = pick(candidates);
      raise(person, kindFor(person), int(1, size > 1000 ? 4 : 3));
      const remarries = again > 0 && person.sex === "male" && room() > 1 && person.birth < 1965;
      if (remarries && generation % 2 === 0) {
        again -= 1;
        raise(person, kindFor(person), int(0, 2));
      }
      continue;
    }
    const open = unions.filter((union) => canBear(union));
    if (open.length === 0) throw new RangeError(`no room for ${size} people`);
    bear(pick(open));
  }

  return { people, unions, links, lastCouple, friend };
}
