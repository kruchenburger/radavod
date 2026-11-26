import calcTree from "relatives-tree";
import type { Node as RelativeNode } from "relatives-tree/lib/types";
import type { TreeSnapshot, TreeUnion } from "../../../src/shared/tree";
import { bottomOf, detailRuns, nameRuns } from "./around-text";
import { isOfLine, type Kin, kinOf, leastSure, listOf, type ParentSet } from "./kin";
import { flow, nameLines, type Run } from "./text";
import {
  type Card,
  type Layout,
  type Line,
  type Measure,
  type ParentageLink,
  type Point,
  personKey,
  type UnionLink,
  type Wording,
} from "./types";

/** Sizes of the tree by generations, those of docs/design.md. The screen may change any of them. */
export type GenerationsMetrics = {
  /** The width of a card. All cards are as wide and as high as each other. */
  card: number;
  /** Between the cards of a row, and between rows. */
  gapX: number;
  gapY: number;
  /** Inside a card, after the rule of the branch on its left. */
  padX: number;
  padY: number;
  rule: number;
  /** Heights of lines. */
  name: number;
  detail: number;
  /** Between the bars of two families in one gap, and between drops from one card. */
  lane: number;
};

export const generationsMetrics: GenerationsMetrics = {
  card: 176,
  gapX: 28,
  gapY: 56,
  padX: 10,
  padY: 8,
  rule: 3,
  name: 20,
  detail: 18,
  lane: 6,
};

export type GenerationsOptions = {
  measure: Measure;
  wording: Wording;
  /** The person the direct line begins with. */
  lineOf?: string | null;
  /** Generations of ancestors and of descendants. */
  up?: number;
  down?: number;
  metrics?: Partial<GenerationsMetrics>;
};

export type GenerationsCard = Card & {
  person: string;
  /** The texts, counted from the corner of the card. */
  lines: Line[];
  /** Rows from the top, the row of the chosen person among them. */
  row: number;
};

export type GenerationsLayout = Omit<Layout, "cards"> & {
  cards: GenerationsCard[];
  /** The key of the chosen person; there is no card for somebody the snapshot does not know. */
  focus: string;
  /** Keys of every row from left to right, rows from the top. */
  rows: string[][];
};

/**
 * The tree by generations around one person: older generations above, a couple side by side with
 * a short line between them, children hanging from one bar under the couple. relatives-tree says
 * where every card stands; the cards, their texts and every line are laid out here.
 */
export function generations(
  snapshot: TreeSnapshot,
  focus: string,
  options: GenerationsOptions,
): GenerationsLayout {
  const kin = kinOf(snapshot);
  const metrics = { ...generationsMetrics, ...options.metrics };
  const empty = { cards: [], links: [], width: 0, height: 0, order: [], rows: [] };
  if (kin.person(focus) === undefined) return { ...empty, focus: personKey(focus) };
  const shape = shapeOf(kin, peopleAround(kin, focus, options.up ?? 3, options.down ?? 2), focus);
  const placed = calcTree(nodesOf(kin, shape), { rootId: focus, placeholders: false });
  const grid = new Map<string, { left: number; top: number }>();
  for (const { id, left, top } of placed.nodes) if (!grid.has(id)) grid.set(id, { left, top });
  const tops = new Map<number, number[]>();
  for (const { left, top } of grid.values()) listOf(tops, top).push(left);
  /** In one row with nobody between: a line may join them. */
  const isBeside = (a: string, b: string): boolean => {
    const [first, second] = [grid.get(a), grid.get(b)];
    if (first === undefined || second === undefined || first.top !== second.top) return false;
    const [from, to] = [Math.min(first.left, second.left), Math.max(first.left, second.left)];
    return !(tops.get(first.top) ?? []).some((left) => left > from && left < to);
  };
  const couples = kin.couples.filter(({ a, b }) => grid.has(a) && grid.has(b));
  const apart = new Map<string, string[]>();
  for (const { a, b } of couples) {
    if (isBeside(a, b)) continue;
    listOf(apart, a).push(b);
    listOf(apart, b).push(a);
  }

  const line = kin.lineOf(options.lineOf ?? null);
  const texts = new Map([...grid.keys()].map((id) => [id, textOf(id)]));
  const height =
    2 * metrics.padY + Math.max(0, ...[...texts.values()].map((lines) => bottomOf(lines)));
  const unitX = (metrics.card + metrics.gapX) / 2;
  const unitY = (height + metrics.gapY) / 2;
  const rowTops = [...tops.keys()].sort((a, b) => a - b);
  const cards: GenerationsCard[] = [...grid].map(([id, { left, top }]) => ({
    key: personKey(id),
    person: id,
    x: left * unitX + metrics.gapX / 2,
    y: top * unitY + metrics.gapY / 2,
    w: metrics.card,
    h: height,
    direct: line.has(id),
    lines: texts.get(id) ?? [],
    row: rowTops.indexOf(top),
  }));
  const rows = rowsOf(cards);
  const byId = new Map(cards.map((card) => [card.person, card]));
  const links = [
    ...parentageLinks(kin, byId, isBeside, line, metrics),
    ...couples.map(({ union, a, b }) => unionLink(union, a, b)),
  ];
  return {
    cards,
    links,
    width: placed.canvas.width * unitX,
    height: placed.canvas.height * unitY,
    order: rows.flat(),
    rows,
    focus: personKey(focus),
  };

  function textOf(id: string): Line[] {
    const person = kin.person(id);
    if (person === undefined) return [];
    const text = options.wording.person(person);
    const [given, surname] = nameRuns(text, line.has(id));
    const x = metrics.rule + metrics.padX;
    const width = metrics.card - x - metrics.padX;
    const common = { measure: options.measure, width, lines: 2, x };
    const names = nameLines(given, surname, {
      ...common,
      lineHeight: metrics.name,
      y: metrics.padY,
    });
    const lines = [
      ...names,
      ...flow(detailRuns(text), { ...common, lineHeight: metrics.detail, y: bottomOf(names) }),
    ];
    // A partner who stands elsewhere is named under the years, and the name leads there.
    for (const to of apart.get(id) ?? []) {
      const other = kin.person(to);
      if (other === undefined) continue;
      const run: Run = { text: options.wording.apart(other), part: "apart", style: "reference" };
      const y = bottomOf(lines);
      const own = flow([run], { ...common, lineHeight: metrics.name, y, lines: 1 });
      lines.push(...own.map((one) => ({ ...one, to })));
    }
    return lines;
  }

  function unionLink(union: TreeUnion, a: string, b: string): UnionLink {
    const [first, second] = [byId.get(a), byId.get(b)] as [GenerationsCard, GenerationsCard];
    const [left, right] = first.x < second.x ? [first, second] : [second, first];
    const y = left.y + left.h / 2;
    return {
      type: "union",
      family: familyId([a, b]),
      union: union.id,
      // In the order the line goes.
      partners: [left.key, right.key],
      kind: union.kind,
      certainty: union.certainty,
      direct: line.has(a) && line.has(b),
      // Partners who stand apart name each other instead.
      points: isBeside(a, b)
        ? [
            [left.x + left.w, y],
            [right.x, y],
          ]
        : [],
    };
  }
}

/**
 * The chosen person, ancestors `up` generations by the parents that decide where a person stands,
 * siblings, descendants `down` generations, the partners of all but the ancestors, who stand as
 * couples, and the other parent of every child and of a half-brother.
 */
function peopleAround(kin: Kin, focus: string, up: number, down: number): Set<string> {
  const people = new Set([focus]);
  const parents = parentsOf(kin);
  let row = [focus];
  for (let step = 0; step < up; step += 1) {
    row = row.flatMap(parents);
    for (const id of row) people.add(id);
  }
  const own = new Set(parents(focus));
  const siblings = kin
    .siblings(focus)
    .map(({ person }) => person)
    .filter((sibling) => parents(sibling).some((parent) => own.has(parent)));
  const partnered = [focus, ...siblings];
  row = [focus];
  for (let step = 0; step < down; step += 1) {
    row = row.flatMap((id) => childrenOf(kin, id));
    partnered.push(...row);
  }
  for (const id of partnered) {
    people.add(id);
    for (const { other } of kin.unions(id)) if (other !== null) people.add(other);
    if (id !== focus) for (const parent of parents(id)) people.add(parent);
  }
  return people;
}

/** The known parents of the set that decides where a person stands. */
const parentsOf =
  (kin: Kin) =>
  (id: string): string[] =>
    (kin.sets(id)[0]?.known ?? []).filter((parent) => kin.person(parent) !== undefined);

/** Children who stand under this parent: the parent is in the set that decides where they stand. */
const childrenOf = (kin: Kin, parent: string): string[] =>
  kin
    .children(parent)
    .filter(({ child, set }) => kin.sets(child)[0] === set)
    .map(({ child }) => child);

/** Who hangs from whom and who stands beside whom: a tree, whatever loops the family makes. */
type Shape = {
  /** Everybody drawn, in the order they were reached from the chosen person. */
  people: string[];
  parents: Map<string, string[]>;
  partners: Map<string, Set<string>>;
};

/**
 * Walks out from the chosen person and ties everybody on at the first meeting: to the child they
 * were met from, to the parent, or to the partner. A family that loops (a man married to the mother
 * of his wife, an ancestor by two lines) meets somebody a second time, and that tie is left to the
 * pedigree; relatives-tree draws a tree and would go round a loop forever.
 */
function shapeOf(kin: Kin, people: Set<string>, focus: string): Shape {
  const parentsOfTree = parentsOf(kin);
  const parents = new Map<string, string[]>();
  const partners = new Map<string, Set<string>>();
  const partner = (a: string, b: string): void => {
    for (const [one, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const set = partners.get(one) ?? new Set<string>();
      partners.set(one, set.add(other));
    }
  };
  const seen = new Set([focus]);
  const queue = [focus];
  const meet = (id: string): boolean => {
    if (seen.has(id) || !people.has(id)) return false;
    seen.add(id);
    queue.push(id);
    return true;
  };
  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at] as string;
    if (!parents.has(id)) {
      const own = parentsOfTree(id).filter(meet);
      if (own.length > 0) parents.set(id, own);
      if (own.length === 2) partner(own[0] as string, own[1] as string);
    }
    for (const child of childrenOf(kin, id)) {
      if (seen.has(child) || !people.has(child)) continue;
      const other = parentsOfTree(child).find((one) => one !== id && people.has(one));
      const together =
        other !== undefined && (meet(other) || partners.get(id)?.has(other) === true);
      if (other !== undefined && together) partner(id, other);
      meet(child);
      parents.set(child, other !== undefined && together ? [id, other] : [id]);
    }
    for (const { other } of kin.unions(id)) if (other !== null && meet(other)) partner(id, other);
  }
  return { people: queue, parents, partners };
}

/** The people as relatives-tree reads them. */
function nodesOf(kin: Kin, { people, parents, partners }: Shape): RelativeNode[] {
  const children = new Map<string, string[]>();
  for (const [child, own] of parents) {
    for (const parent of own) listOf(children, parent).push(child);
  }
  const blood = (id: string) => ({ id, type: "blood" });
  return people.map((id) => {
    const own = parents.get(id) ?? [];
    const siblings = new Set(own.flatMap((parent) => children.get(parent) ?? []));
    siblings.delete(id);
    const node = {
      id,
      gender: kin.person(id)?.sex === "female" ? "female" : "male",
      parents: own.map(blood),
      children: (children.get(id) ?? []).sort(kin.byBirth).map(blood),
      siblings: [...siblings].map(blood),
      spouses: [...(partners.get(id) ?? [])].map((other) => ({ id: other, type: "married" })),
    };
    // The library spells its kinds as enums of its own; the strings are the same.
    return node as unknown as RelativeNode;
  });
}

function rowsOf(cards: GenerationsCard[]): string[][] {
  const rows: GenerationsCard[][] = [];
  for (const card of cards) (rows[card.row] ??= []).push(card);
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map(({ key }) => key));
}

type Family = {
  id: string;
  set: ParentSet;
  /** The set decides where the child stands. */
  isTree: boolean;
  parents: string[];
  /** Where the line leaves the parents, and where it goes down. */
  edge?: Point;
  /** Where the line of the couple runs. */
  join?: [number, number];
  from: Point;
  child: GenerationsCard;
  /** How far from the middle of the child the line comes in. */
  arrive: number;
};

/**
 * From a couple of record that stands side by side the line leaves the middle of their join; from
 * a parent without one it leaves the bottom of the card, each family a little apart. It goes down
 * to one bar over the children of the family, in a lane of its own where bars would meet.
 */
function parentageLinks(
  kin: Kin,
  byId: Map<string, GenerationsCard>,
  isBeside: (a: string, b: string) => boolean,
  line: Set<string>,
  metrics: GenerationsMetrics,
): ParentageLink[] {
  const families: Family[] = [];
  const drops = new Map<string, string[]>();
  for (const child of byId.values()) {
    const sets = kin.sets(child.person);
    let slot = 0;
    for (const set of sets) {
      // A parent stands one row above; a tie across rows is one of a family that loops.
      const parents = set.known.flatMap((id) => {
        const card = byId.get(id);
        return card !== undefined && card.row === child.row - 1 ? [card] : [];
      });
      const own = parents.map(({ person }) => person);
      const [a, b] = parents;
      if (a === undefined) continue;
      const isCouple =
        b !== undefined &&
        isBeside(a.person, b.person) &&
        kin.unions(a.person).some(({ other }) => other === b.person);
      const id = familyId(own);
      const isTree = sets[0] === set;
      // Two sets of parents come to a child side by side.
      const arrive = (slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2) * metrics.lane * 2;
      slot += 1;
      if (b !== undefined && isCouple) {
        const [left, right] = a.x < b.x ? [a, b] : [b, a];
        const y = left.y + left.h / 2;
        // From the edge of a partner along the line of the couple to its middle.
        const edge: Point = [left.x + left.w, y];
        const from: Point = [(left.x + left.w + right.x) / 2, y];
        const join: [number, number] = [left.x + left.w, right.x];
        families.push({ id, set, isTree, parents: own, edge, join, from, child, arrive });
        continue;
      }
      for (const parent of parents) {
        const taken = listOf(drops, parent.person);
        if (!taken.includes(id)) taken.push(id);
        const one = [parent.person];
        families.push({ id, set, isTree, parents: one, from: [0, 0], child, arrive });
      }
    }
  }
  // A couple far apart goes down near its children, not over somebody else's.
  const couples = new Map<string, Family[]>();
  for (const family of families) {
    if (family.join !== undefined) listOf(couples, `${family.id} ${family.from[1]}`).push(family);
  }
  for (const own of couples.values()) {
    const [lo, hi] = own[0]?.join ?? [0, 0];
    if (hi - lo <= metrics.gapX + 1) continue;
    const centres = own.map(({ child, arrive }) => child.x + child.w / 2 + arrive);
    const mean = centres.reduce((sum, x) => sum + x, 0) / centres.length;
    const x = Math.min(hi - 2 * metrics.lane, Math.max(lo + 2 * metrics.lane, mean));
    for (const family of own) family.from = [x, family.from[1]];
  }
  // Drops from one card stand side by side under it, off its middle, where a child below may stand.
  for (const family of families) {
    if (family.edge !== undefined) continue;
    const parent = byId.get(family.parents[0] as string) as GenerationsCard;
    const at = (drops.get(parent.person) ?? []).indexOf(family.id);
    const step = (at % 2 === 0 ? -1 : 1) * (Math.floor(at / 2) + 1) * metrics.lane * 2;
    family.from = [parent.x + parent.w / 2 + step, parent.y + parent.h];
  }

  const bars = new Map<string, { y: number; from: number; to: number; families: Family[] }>();
  for (const family of families) {
    const name = `${family.id} ${family.from.join(" ")} ${family.child.row}`;
    const x = family.child.x + family.child.w / 2 + family.arrive;
    const bar = bars.get(name) ?? {
      y: family.child.y - metrics.gapY / 2,
      from: family.from[0],
      to: family.from[0],
      families: [],
    };
    bar.from = Math.min(bar.from, x);
    bar.to = Math.max(bar.to, x);
    bar.families.push(family);
    bars.set(name, bar);
  }
  const lanes = new Map<number, number[]>();
  const sorted = [...bars.values()].sort((a, b) => a.y - b.y || a.from - b.from);
  const laneOf = new Map<(typeof sorted)[number], number>();
  for (const bar of sorted) {
    const ends = listOf(lanes, bar.y);
    let lane = ends.findIndex((end) => end < bar.from - metrics.lane);
    if (lane < 0) lane = ends.push(bar.to) - 1;
    else ends[lane] = bar.to;
    laneOf.set(bar, lane);
  }
  return sorted.flatMap((bar) => {
    const count = lanes.get(bar.y)?.length ?? 1;
    // Many families in one gap draw their bars closer, never out of the gap.
    const lane = Math.min(metrics.lane, (metrics.gapY - 4 * metrics.lane) / Math.max(1, count - 1));
    const y = bar.y + ((laneOf.get(bar) ?? 0) - (count - 1) / 2) * lane;
    return bar.families.map((family) => parentage(family, y));
  });

  function parentage(family: Family, y: number): ParentageLink {
    const { id, set, isTree, parents, edge, from, child, arrive } = family;
    const x = child.x + child.w / 2 + arrive;
    const down: Point[] = [from, [from[0], y], [x, y], [x, child.y]];
    const ties = set.members.flatMap(({ parent, certainty }) =>
      parent !== null && parents.includes(parent) ? [{ parent: personKey(parent), certainty }] : [],
    );
    return {
      type: "parentage",
      family: id,
      parents: parents.map(personKey),
      child: child.key,
      ties,
      certainty: leastSure(ties.map(({ certainty }) => certainty)),
      kind: set.kind,
      main: set.main,
      tree: isTree,
      direct: isOfLine(set) && line.has(child.person),
      points: straight(edge === undefined ? down : [edge, ...down]),
    };
  }
}

const familyId = (people: string[]): string => [...people].sort().join(" + ");

/** Leaves out the pieces of no length and joins the ones that go on in one direction. */
function straight(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last !== undefined && last[0] === point[0] && last[1] === point[1]) continue;
    const before = kept.at(-2);
    if (
      last !== undefined &&
      before !== undefined &&
      ((before[0] === last[0] && last[0] === point[0]) ||
        (before[1] === last[1] && last[1] === point[1]))
    ) {
      kept[kept.length - 1] = point;
      continue;
    }
    kept.push(point);
  }
  return kept;
}
