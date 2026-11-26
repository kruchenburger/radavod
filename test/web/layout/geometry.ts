import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  type Box,
  type Card,
  type Layout,
  type Line,
  type Link,
  type Measure,
  type ParentageLink,
  type Point,
  personKey,
} from "../../../web/tree/layout/types";

export type Drawing = Pick<Layout, "cards" | "links" | "width" | "height">;

export type Rules = {
  snapshot: TreeSnapshot;
  /** Everybody who must be drawn. */
  people: Iterable<string>;
  /** Along which axis the children of a family stand. */
  children: "x" | "y";
  lines?: (card: Card) => Line[];
  measure?: Measure;
  /** Which row a card stands in, when a row holds columns of cards. */
  row?: (card: Card) => string;
  /** The people of the direct line. */
  line?: ReadonlySet<string>;
  /** How far apart lines must run outside of these boxes. */
  spacing?: { least: number; outside: Box[] };
  /** A list with indents: deeper rows may stand between partners. */
  isList?: boolean;
};

/** Each finding names its place. Empty lists mean a good drawing. */
export type Findings = {
  badNumbers: string[];
  outside: string[];
  overlaps: string[];
  missingPeople: string[];
  extraPeople: string[];
  duplicates: string[];
  throughCards: string[];
  slanted: string[];
  loose: string[];
  missingLinks: string[];
  falseLinks: string[];
  merged: string[];
  unordered: string[];
  textOutside: string[];
  badReferences: string[];
  mistold: string[];
  crowded: string[];
  /** A brace whose stem another family's line meets reads as a brace of somebody else. */
  stemsMet: string[];
};

/** How far a line may stop from a card it belongs to. */
const near = 4.5;

export function check(drawing: Drawing, rules: Rules): Findings {
  const { cards, links } = drawing;
  const found: Findings = {
    badNumbers: [],
    outside: [],
    overlaps: [],
    missingPeople: [],
    extraPeople: [],
    duplicates: [],
    throughCards: [],
    slanted: [],
    loose: [],
    missingLinks: [],
    falseLinks: [],
    merged: [],
    unordered: [],
    textOutside: [],
    badReferences: [],
    mistold: [],
    crowded: [],
    stemsMet: [],
  };
  const byKey = new Map(cards.map((card) => [card.key, card]));
  checkNumbers(drawing, found);
  checkPeople(cards, rules, found);
  checkOverlaps(cards, found);
  checkPaths(cards, byKey, links, rules, found);
  checkLinks(byKey, links, rules, found);
  checkMerged(links, found);
  checkOrder(byKey, links, rules, found);
  checkText(cards, rules, found);
  checkReferences(byKey, links, found);
  checkTold(byKey, links, rules, found);
  checkCrowded(links, rules, found);
  checkStems(links, found);
  return found;
}

/** Only the lists with something in them, cut short. */
export function problems(drawing: Drawing, rules: Rules): Partial<Findings> {
  const all = Object.entries(check(drawing, rules));
  return Object.fromEntries(
    all.filter(([, list]) => list.length > 0).map(([key, list]) => [key, list.slice(0, 5)]),
  );
}

function checkNumbers({ cards, links, width, height }: Drawing, found: Findings): void {
  const isFine = (n: number): boolean => Number.isFinite(n);
  if (!isFine(width) || !isFine(height)) found.badNumbers.push("the layout");
  const isInside = (x: number, y: number): boolean =>
    x >= -0.5 && y >= -0.5 && x <= width + 0.5 && y <= height + 0.5;
  for (const { key, x, y, w, h } of cards) {
    if (![x, y, w, h].every(isFine) || w <= 0 || h <= 0) found.badNumbers.push(key);
    if (!isInside(x, y) || !isInside(x + w, y + h)) found.outside.push(key);
  }
  for (const link of links) {
    if (!link.points.flat().every(isFine)) found.badNumbers.push(nameOf(link));
    if (!link.points.every(([x, y]) => isInside(x, y))) found.outside.push(nameOf(link));
  }
}

function checkPeople(cards: Card[], { people }: Rules, found: Findings): void {
  const expected = new Set(people);
  const keys = new Set<string>();
  const seen = new Set<string>();
  for (const { key, person } of cards) {
    if (keys.has(key) || (person !== null && seen.has(person))) found.duplicates.push(key);
    keys.add(key);
    if (person === null) continue;
    seen.add(person);
    if (!expected.has(person)) found.extraPeople.push(person);
  }
  for (const person of expected) if (!seen.has(person)) found.missingPeople.push(person);
}

function checkOverlaps(cards: Card[], found: Findings): void {
  const grid = new Grid<Card>();
  for (const card of cards) {
    for (const other of grid.near(card)) {
      const w = -gap(card.x, card.w, other.x, other.w);
      const h = -gap(card.y, card.h, other.y, other.h);
      if (w > 0.01 && h > 0.01) found.overlaps.push(`${card.key} ${other.key}`);
    }
    grid.add(card, card);
  }
}

function checkPaths(
  cards: Card[],
  byKey: Map<string, Card>,
  links: Link[],
  { isList = false, lines }: Rules,
  found: Findings,
): void {
  // Partners who stand apart have no line; each must name the other, and lead there.
  const names = (key: string, other: string): boolean => {
    const card = byKey.get(key);
    const person = byKey.get(other)?.person;
    return (
      card !== undefined &&
      lines !== undefined &&
      lines(card).some((line) => line.part === "apart" && line.to === person)
    );
  };
  const grid = new Grid<Card>();
  for (const card of cards) grid.add(card, card);
  const unions = new Set(
    links.flatMap((link) => (link.type === "union" ? [pairOf(...link.partners)] : [])),
  );
  for (const link of links) {
    const { points } = link;
    const [first] = points;
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      const [a, b] = link.type === "union" ? [link.partners[0], link.at ?? link.partners[1]] : [];
      const isNear =
        a !== undefined &&
        b !== undefined &&
        (standTogether([a, b], byKey, links, isList) || (names(a, b) && names(b, a)));
      if (!isNear) found.loose.push(nameOf(link));
      continue;
    }
    const [from, to] = endsOf(link);
    if (link.type === "parentage" && link.parentsAt === undefined) {
      const [a, b] = link.parents;
      const isCouple = b === undefined || unions.has(pairOf(a ?? "", b));
      const isNear = isCouple || standTogether([a ?? "", b ?? ""], byKey, links, isList);
      if (!isNear) found.loose.push(nameOf(link));
    }
    const touches = (point: Point, keys: string[]): boolean =>
      keys.some((key) => touchesCard(point, byKey.get(key)));
    if (!touches(first, from) || !touches(last, to)) found.loose.push(nameOf(link));
    for (const [a, b] of pieces(points)) {
      const box = boxOf(a, b);
      if (box.w > 0.01 && box.h > 0.01) found.slanted.push(nameOf(link));
      for (const card of grid.near(box)) {
        // A line may touch the border of a card and enter none, its own ends included.
        const inside = lengthInside(box, card, 0.5);
        if (inside > 0.5) found.throughCards.push(`${nameOf(link)}: ${card.key}`);
      }
    }
  }
}

/** The cards a line may begin at and end at. */
function endsOf(link: Link): [from: string[], to: string[]] {
  switch (link.type) {
    case "union":
      return [[link.partners[0]], [link.at ?? link.partners[1]]];
    case "reference":
      return [[link.reference], link.to];
    case "parentage": {
      const { parents, parentsAt, child, childAt } = link;
      return [parentsAt === undefined ? parents : [...parents, parentsAt], [childAt ?? child]];
    }
  }
}

/** References name people who stand somewhere, and links use them for those people alone. */
function checkReferences(byKey: Map<string, Card>, links: Link[], found: Findings): void {
  const named = (key: string): string[] => (byKey.get(key)?.reference?.people ?? []).map(personKey);
  for (const { key, reference } of byKey.values()) {
    if (reference === undefined) continue;
    const people = named(key);
    if (people.length === 0 || people.some((person) => byKey.get(person)?.person == null)) {
      found.badReferences.push(key);
    }
  }
  for (const link of links) {
    const isFor = (key: string | undefined, people: string[]): boolean =>
      key === undefined ||
      (named(key).length > 0 && named(key).every((person) => people.includes(person)));
    const isRight =
      link.type === "parentage"
        ? isFor(link.parentsAt, link.parents) && isFor(link.childAt, [link.child])
        : link.type === "union"
          ? isFor(link.at, link.partners)
          : isFor(link.reference, link.to);
    if (!isRight) found.badReferences.push(nameOf(link));
  }
}

/** A couple that needs no line of its own: the cards touch, or they are the arms of one brace. */
function standTogether(
  partners: [string, string],
  byKey: Map<string, Card>,
  links: Link[],
  isList: boolean,
): boolean {
  const [a, b] = partners.map((key) => byKey.get(key));
  if (a === undefined || b === undefined) return false;
  const gapX = gap(a.x, a.w, b.x, b.w);
  const gapY = gap(a.y, a.h, b.y, b.h);
  if (Math.abs(gapX) < 0.01 && gapY < 0) return true;
  if (gapY >= -0.01 && gapY <= near && gapX < 0) return true;
  if (areOfOneStack(a, b, byKey, links, isList)) return true;
  const arms = (key: string): string[] =>
    links.flatMap((link) =>
      link.type === "parentage" && link.parents.length === 1 && link.parents[0] === key
        ? [`${link.family} ${link.child}`]
        : [],
    );
  const first = new Set(arms(a.key));
  return arms(b.key).some((arm) => first.has(arm));
}

/** Partners in a pile under one person: nothing but other partners of either between the two. */
function areOfOneStack(
  a: Card,
  b: Card,
  byKey: Map<string, Card>,
  links: Link[],
  isList: boolean,
): boolean {
  if (a.x !== b.x || a.w !== b.w) return false;
  const [upper, lower] = a.y < b.y ? [a, b] : [b, a];
  const partners = new Set(
    links.flatMap((link) => {
      if (link.type === "reference") return [];
      const pair =
        link.type === "union"
          ? [...link.partners, ...(link.at === undefined ? [] : [link.at])]
          : [...link.parents, ...(link.parentsAt === undefined ? [] : [link.parentsAt])];
      return pair.includes(a.key) || pair.includes(b.key) ? pair : [];
    }),
  );
  // Unfolded siblings stand between a person and the partners.
  const parents = new Set(
    links.flatMap((link) =>
      link.type === "parentage" && (link.child === a.key || link.child === b.key)
        ? link.parents
        : [],
    ),
  );
  for (const link of links) {
    if (link.type !== "parentage" || !link.parents.some((key) => parents.has(key))) continue;
    partners.add(link.child);
  }
  // Under a partner stand references to other partners of that partner.
  for (const link of links) {
    if (link.type === "reference") continue;
    const at = link.type === "union" ? link.at : link.parentsAt;
    const [own = ""] = link.type === "union" ? link.partners : link.parents;
    if (at !== undefined && partners.has(own)) partners.add(at);
  }
  let bottom = upper.y + upper.h;
  const between = [...byKey.values()]
    .filter(({ x, w, y }) => (isList || (x === a.x && w === a.w)) && y > upper.y && y <= lower.y)
    .filter(({ x }) => !isList || x <= a.x)
    .sort((first, second) => first.y - second.y);
  for (const card of between) {
    if ((card.y - bottom > near && !isList) || !partners.has(card.key)) return false;
    bottom = card.y + card.h;
  }
  return true;
}

function checkLinks(
  byKey: Map<string, Card>,
  links: Link[],
  { snapshot }: Rules,
  found: Findings,
): void {
  const drawn = new Map<string, string[]>();
  for (const link of links) {
    if (link.type === "reference") continue;
    if (link.type === "union") drawn.set(pairOf(...link.partners), link.partners);
    else
      for (const parent of link.parents)
        drawn.set(`${parent} > ${link.child}`, [parent, link.child]);
  }
  const told = new Map<string, string[]>();
  const tell = (edge: string, ...ids: string[]): void => {
    told.set(edge, ids.map(personKey));
  };
  const seen = new Set<string>();
  for (const { id, parents } of snapshot.people) {
    if (seen.has(id)) continue;
    seen.add(id);
    for (const { parent } of parents) {
      if (parent !== null && parent !== id) {
        tell(`${personKey(parent)} > ${personKey(id)}`, parent, id);
      }
    }
  }
  for (const { partners } of snapshot.unions) {
    const [a, b] = partners;
    if (b !== null && a !== b) tell(pairOf(personKey(a), personKey(b)), a, b);
  }
  for (const [edge, keys] of told) {
    if (keys.every((key) => byKey.has(key)) && !drawn.has(edge)) found.missingLinks.push(edge);
  }
  for (const [edge, keys] of drawn) {
    const cards = keys.map((key) => byKey.get(key));
    const isOfUnknown = cards.some((card) => card?.person === null);
    if (cards.includes(undefined) || (!isOfUnknown && !told.has(edge))) found.falseLinks.push(edge);
  }
}

const kinds = ["blood", "adoption", "unknown", "guardianship"];
const leastSure = ["contradiction", "unresolved", "hypothesis", "one-source", "confirmed"];

/** Lines say of kinship what the snapshot says: kind, main, certainty, the direct line. */
function checkTold(
  byKey: Map<string, Card>,
  links: Link[],
  { snapshot, line }: Rules,
  found: Findings,
): void {
  const people = new Map([...snapshot.people].reverse().map((person) => [person.id, person]));
  const wrong = (link: Link, what: string): void => {
    found.mistold.push(`${nameOf(link)}: ${what}`);
  };
  /** One parent told in several ways counts by the surest way. */
  const parentageOf = ({ child: childKey, kind, main }: ParentageLink, parentKey: string) => {
    const child = people.get(byKey.get(childKey)?.person ?? "");
    const parent = byKey.get(parentKey);
    const unknown = parent?.unknown;
    if (unknown !== undefined) {
      if (unknown.of === "partner") {
        return child?.parents.find(
          (one) => one.parent === null && one.kind === kind && one.main === main,
        );
      }
      const own = child?.parents.filter(
        (one) =>
          one.parent === null &&
          one.kind === kind &&
          one.main === main &&
          unknown.parentages.includes(one.id),
      );
      return own?.sort((a, b) => sureness(a.certainty) - sureness(b.certainty))[0];
    }
    return child?.parents
      .filter((one) => one.parent !== null && one.parent === parent?.person)
      .sort(
        (a, b) => Number(b.main) - Number(a.main) || kinds.indexOf(a.kind) - kinds.indexOf(b.kind),
      )[0];
  };
  const sureness = (certainty: string): number => leastSure.indexOf(certainty);

  for (const link of links) {
    if (link.type === "union") {
      const told = snapshot.unions.filter(
        ({ id, partners: [a, b] }) =>
          id === link.union &&
          (link.partners.includes(personKey(a)) ||
            (b !== null && link.partners.includes(personKey(b)))),
      );
      const isTold = told.some(
        ({ kind, certainty }) => kind === link.kind && certainty === link.certainty,
      );
      if (!isTold) wrong(link, "union");
    }
    if (link.type !== "parentage") continue;
    const ties = new Map(link.ties.map(({ parent, certainty }) => [parent, certainty]));
    const sure = Math.min(...link.ties.map(({ certainty }) => sureness(certainty)));
    if (sureness(link.certainty) !== sure) wrong(link, "certainty of the line");
    if (link.ties.some(({ parent }) => !link.parents.includes(parent))) wrong(link, "ties");
    for (const parent of link.parents) {
      const told = parentageOf(link, parent);
      // An unknown partner may stand for a parent nobody wrote down.
      if (told === undefined && byKey.get(parent)?.unknown?.of === "partner") continue;
      if (told === undefined || told.kind !== link.kind || told.main !== link.main) {
        wrong(link, `kind of ${parent}`);
      }
      if (told !== undefined && told.certainty !== ties.get(parent)) {
        wrong(link, `certainty of ${parent}`);
      }
    }
    if (line === undefined) continue;
    const child = byKey.get(link.child)?.person ?? "";
    const isDirect = link.main && link.kind === "blood" && line.has(child);
    if (isDirect !== link.direct) wrong(link, "direct");
  }
  for (const { key, person, direct } of byKey.values()) {
    if (line !== undefined && direct !== (person !== null && line.has(person))) {
      found.mistold.push(`${key}: direct`);
    }
  }
}

/** Lines of different families side by side, where the design keeps them apart. */
function checkCrowded(links: Link[], { spacing }: Rules, found: Findings): void {
  if (spacing === undefined) return;
  const { least, outside } = spacing;
  type Piece = Box & { family: string; name: string; isFlat: boolean };
  const grid = new Grid<Piece>();
  for (const link of links) {
    for (const [a, b] of pieces(link.points)) {
      const whole = boxOf(a, b);
      const isFlat = whole.h < 0.01;
      for (const box of cutOut(whole, isFlat, outside)) {
        const piece: Piece = { ...box, isFlat, family: link.family, name: nameOf(link) };
        for (const other of grid.near(piece, least)) {
          if (other.family === piece.family || other.isFlat !== isFlat) continue;
          const [along, apart] = isFlat
            ? [-gap(piece.x, piece.w, other.x, other.w), Math.abs(piece.y - other.y)]
            : [-gap(piece.y, piece.h, other.y, other.h), Math.abs(piece.x - other.x)];
          if (along > 0.5 && apart < least - 0.01) {
            found.crowded.push(`${piece.name} and ${other.name}: ${apart}`);
          }
        }
        grid.add(piece, piece);
      }
    }
  }
}

/** The parts of a straight piece that lie outside of all boxes. */
function cutOut(piece: Box, isFlat: boolean, boxes: Box[]): Box[] {
  let parts = [piece];
  for (const box of boxes) {
    const isBeside = isFlat
      ? piece.y <= box.y || piece.y >= box.y + box.h
      : piece.x <= box.x || piece.x >= box.x + box.w;
    if (isBeside) continue;
    parts = parts.flatMap((part) => {
      const [from, to] = isFlat ? [part.x, part.x + part.w] : [part.y, part.y + part.h];
      const [start, end] = isFlat ? [box.x, box.x + box.w] : [box.y, box.y + box.h];
      const rest: [number, number][] = [
        [from, Math.min(to, start)],
        [Math.max(from, end), to],
      ];
      return rest
        .filter(([a, b]) => b > a)
        .map(([a, b]) => (isFlat ? { ...part, x: a, w: b - a } : { ...part, y: a, h: b - a }));
    });
  }
  return parts;
}

function checkMerged(links: Link[], found: Findings): void {
  type Piece = Box & { family: string; name: string };
  const grid = new Grid<Piece>();
  for (const link of links) {
    for (const [a, b] of pieces(link.points)) {
      const piece: Piece = { ...boxOf(a, b), family: link.family, name: nameOf(link) };
      for (const other of grid.near(piece, 2)) {
        if (other.family === piece.family) continue;
        const isFlat = piece.h < 0.01 && other.h < 0.01;
        const isUpright = piece.w < 0.01 && other.w < 0.01;
        if (!isFlat && !isUpright) continue;
        const [along, apart] = isFlat
          ? [-gap(piece.x, piece.w, other.x, other.w), Math.abs(piece.y - other.y)]
          : [-gap(piece.y, piece.h, other.y, other.h), Math.abs(piece.x - other.x)];
        if (apart < 1.5 && along > 0.5) found.merged.push(`${piece.name} and ${other.name}`);
      }
      grid.add(piece, piece);
    }
  }
}

/** No line of a union touches the upright part of a line from parents to a child. */
function checkStems(links: Link[], found: Findings): void {
  type Piece = Box & { family: string; name: string };
  const stems = new Grid<Piece>();
  for (const link of links) {
    if (link.type !== "parentage") continue;
    for (const [a, b] of pieces(link.points)) {
      const box = boxOf(a, b);
      if (box.w < 0.01 && box.h > 0.01) {
        stems.add({ ...box, family: link.family, name: nameOf(link) }, box);
      }
    }
  }
  const told = new Set<string>();
  for (const link of links) {
    for (const [a, b] of pieces(link.points)) {
      const box = boxOf(a, b);
      for (const stem of stems.near(box, 0.5)) {
        // A line of a union that meets a brace reads as a part of it.
        if (link.type !== "union" || stem.family === link.family) continue;
        // A place of an unknown partner stands by the partner, but for families that loop.
        if (!link.partners.every((key) => key.startsWith("p:"))) continue;
        const meets =
          gap(box.x, box.w, stem.x, 0) <= 0.5 && gap(box.y, box.h, stem.y, stem.h) <= 0.5;
        const name = `${stem.name} by ${nameOf(link)}`;
        if (meets && !told.has(name)) {
          told.add(name);
          found.stemsMet.push(name);
        }
      }
    }
  }
}

function checkOrder(
  byKey: Map<string, Card>,
  links: Link[],
  { snapshot, children, row }: Rules,
  found: Findings,
): void {
  const other = children === "x" ? "y" : "x";
  const rank = new Map<string, number>();
  // Of two people with one id the first counts.
  const once = new Map([...snapshot.people].reverse().map((person) => [person.id, person]));
  snapshot.people
    .filter((person) => once.get(person.id) === person)
    .map(({ id, birth }, i) => ({ id, i, sort: birth?.sort ?? Infinity }))
    .sort((a, b) => (a.sort === b.sort ? a.i - b.i : a.sort - b.sort))
    .forEach(({ id }, i) => rank.set(id, rank.get(id) ?? i));
  const families = new Map<string, Set<Card>>();
  for (const link of links) {
    if (link.type !== "parentage" || (!link.tree && link.childAt === undefined)) continue;
    const child = byKey.get(link.childAt ?? link.child);
    if (child === undefined) continue;
    const family = `${link.family} at ${row?.(child) ?? child[other]}`;
    families.set(family, (families.get(family) ?? new Set()).add(child));
  }
  for (const [family, cards] of families) {
    const placed = [...cards].sort((a, b) => a[children] - b[children] || a[other] - b[other]);
    const ranks = placed.map(
      ({ person, reference }) => rank.get(person ?? reference?.people[0] ?? "") ?? -1,
    );
    if (ranks.some((value, i) => i > 0 && value < (ranks[i - 1] ?? 0))) {
      found.unordered.push(`${family}: ${placed.map(({ key }) => key).join(" ")}`);
    }
  }
}

function checkText(cards: Card[], { lines, measure }: Rules, found: Findings): void {
  if (lines === undefined) return;
  for (const card of cards) {
    const own = lines(card);
    own.forEach((line, i) => {
      const isInside =
        line.x >= -0.01 &&
        line.y >= -0.01 &&
        line.x + line.w <= card.w + 0.01 &&
        line.y + line.h <= card.h + 0.01;
      const fits = measure === undefined || measure(line.text, line.style) <= line.w + 0.01;
      const isClear = own
        .slice(0, i)
        .every(
          (other) =>
            gap(line.x, line.w, other.x, other.w) >= -0.01 ||
            gap(line.y, line.h, other.y, other.h) >= -0.01,
        );
      if (!isInside || !fits || !isClear) found.textOutside.push(`${card.key}: ${line.text}`);
    });
  }
}

export function nameOf(link: Link): string {
  if (link.type === "reference") return `${link.reference} >> ${link.to.join(" & ")}`;
  return link.type === "union"
    ? link.partners.join(" + ")
    : `${link.parents.join(" & ")} > ${link.child}`;
}

/** Plain crossings of lines of different families: a number to compare layouts by, not a defect. */
export function crossings(links: Link[]): number {
  type Piece = Box & { family: string };
  const flat = new Grid<Piece>();
  const upright: Piece[] = [];
  for (const { points, family } of links) {
    for (const [a, b] of pieces(points)) {
      const piece = { ...boxOf(a, b), family };
      if (piece.h < 0.01) flat.add(piece, piece);
      else upright.push(piece);
    }
  }
  let count = 0;
  for (const piece of upright) {
    for (const other of flat.near(piece)) {
      const isCrossed =
        other.x < piece.x - 0.5 &&
        other.x + other.w > piece.x + 0.5 &&
        piece.y < other.y - 0.5 &&
        piece.y + piece.h > other.y + 0.5;
      if (isCrossed && other.family !== piece.family) count += 1;
    }
  }
  return count;
}

const pairOf = (a: string, b: string): string => [a, b].sort().join(" + ");

const pieces = (points: Point[]): [Point, Point][] =>
  points.slice(1).map((point, i) => [points[i] as Point, point]);

const boxOf = ([ax, ay]: Point, [bx, by]: Point): Box => ({
  x: Math.min(ax, bx),
  y: Math.min(ay, by),
  w: Math.abs(ax - bx),
  h: Math.abs(ay - by),
});

/** The distance between two intervals; below zero they overlap. */
const gap = (a: number, aSize: number, b: number, bSize: number): number =>
  Math.max(a, b) - Math.min(a + aSize, b + bSize);

function touchesCard([x, y]: Point, card: Card | undefined): boolean {
  if (card === undefined) return false;
  const dx = Math.max(card.x - x, 0, x - card.x - card.w);
  const dy = Math.max(card.y - y, 0, y - card.y - card.h);
  return Math.max(dx, dy) <= near;
}

/** How much of a piece lies inside a card shrunk by `pad`. */
function lengthInside(piece: Box, card: Box, pad: number): number {
  const w = -gap(piece.x, piece.w, card.x + pad, card.w - 2 * pad);
  const h = -gap(piece.y, piece.h, card.y + pad, card.h - 2 * pad);
  return w < 0 || h < 0 ? 0 : Math.max(w, h);
}

class Grid<T> {
  readonly #size = 200;
  readonly #cells = new Map<string, T[]>();

  #keys({ x, y, w, h }: Box, pad: number): string[] {
    const at = (value: number): number => Math.floor(value / this.#size);
    const keys: string[] = [];
    for (let i = at(x - pad); i <= at(x + w + pad); i += 1) {
      for (let j = at(y - pad); j <= at(y + h + pad); j += 1) keys.push(`${i} ${j}`);
    }
    return keys;
  }

  add(item: T, box: Box): void {
    for (const key of this.#keys(box, 0)) {
      const cell = this.#cells.get(key);
      if (cell === undefined) this.#cells.set(key, [item]);
      else cell.push(item);
    }
  }

  near(box: Box, pad = 1): Set<T> {
    const found = new Set<T>();
    for (const key of this.#keys(box, pad)) {
      for (const item of this.#cells.get(key) ?? []) found.add(item);
    }
    return found;
  }
}
