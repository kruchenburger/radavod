import type { TreeSnapshot } from "../../../src/shared/tree";
import { isOfLine, type Kin, kinOf, leastSure, listOf, type ParentSet } from "./kin";
import { type ParentageLink, personKey, type Reference, type UnionLink } from "./types";

/** What stands on which page and how it hangs together, the same for every level of detail. */
export type MapModel = {
  /** Branch ids; null is the page of people who are nobody's kin. */
  pages: (string | null)[];
  /** Parents before children. */
  nodes: MapNode[];
  links: MapLink[];
  unions: Omit<UnionLink, "points">[];
  /** Pieces of the direct line that go from a reference to the person. */
  crossings: Crossing[];
};

/** A couple with everything that stands with it, or a column of children without families. */
export type MapNode = {
  page: number;
  generation: number;
  isList: boolean;
  rows: MapRow[];
  children: MapNode[];
  parent: MapNode | null;
  /**
   * Families whose lines leave on the right, from top to bottom: one family leaves below, and the
   * others have somebody under them.
   */
  exits: { family: string; row: number }[];
};

export type MapRow = {
  key: string;
  person: string | null;
  reference?: Reference;
  /** 0 for the person a couple stands for, 1 for partners, 2 for partners of a partner. */
  level: number;
  isSpouse: boolean;
  direct: boolean;
};

export type MapLink = Omit<ParentageLink, "points"> & {
  from: { node: MapNode; row: number };
  to: { node: MapNode; row: number };
};

export type Crossing = {
  reference: string;
  to: string;
  family: string;
  certainty: ParentageLink["certainty"];
};

type Unit = {
  index: number;
  head: string;
  spouses: string[];
  home: number;
  /** The unit it stands under. */
  above: Unit | null;
  /** Partners who stand elsewhere, by the member they belong to. */
  elsewhere: Map<string, string[]>;
  families: UnitFamily[];
};

type UnitFamily = {
  parents: string[];
  /** The partner who stands elsewhere, when a reference stands for them. */
  absent: string | null;
  children: { child: string; set: ParentSet; isHere: boolean }[];
};

export function mapModelOf(snapshot: TreeSnapshot, lineOf: string | null): MapModel {
  return new MapBuilder(snapshot, lineOf).build();
}

class MapBuilder {
  readonly #kin: Kin;
  readonly #line: Set<string>;
  readonly #pages: (string | null)[];
  readonly #units: Unit[] = [];
  readonly #unitOf = new Map<string, Unit>();

  constructor(snapshot: TreeSnapshot, lineOf: string | null) {
    this.#kin = kinOf(snapshot);
    this.#line = this.#kin.lineOf(lineOf);
    this.#pages = [...new Set(snapshot.branches.map(({ id }) => id))];
  }

  build(): MapModel {
    this.#joinCouples();
    for (const id of this.#kin.ids) if (!this.#unitOf.has(id)) this.#newUnit(id);
    this.#findHomes();
    this.#noteAbsentPartners();
    this.#attachChildren();
    const generations = this.#generations();
    return this.#lay(generations);
  }

  #newUnit(head: string): Unit {
    const unit: Unit = {
      index: this.#units.length,
      head,
      spouses: [],
      home: -1,
      above: null,
      elsewhere: new Map(),
      families: [],
    };
    this.#units.push(unit);
    this.#unitOf.set(head, unit);
    return unit;
  }

  /** A couple stands together unless one of the two already stands with somebody as a partner. */
  #joinCouples(): void {
    for (const { union, a, b } of this.#kin.couples) {
      const [first, second] = this.#byPrecedence(a, b, union.branch);
      for (const [head, spouse] of [
        [first, second],
        [second, first],
      ] as const) {
        const unit = this.#unitOf.get(head);
        if (this.#unitOf.has(spouse) || (unit !== undefined && unit.head !== head)) continue;
        const members = unit === undefined ? [head] : [head, ...unit.spouses];
        if (members.some((member) => this.#areParentAndChild(member, spouse))) continue;
        const joined = unit ?? this.#newUnit(head);
        joined.spouses.push(spouse);
        this.#unitOf.set(spouse, joined);
        break;
      }
    }
  }

  /** The one whose branch gives the couple its page comes first. */
  #byPrecedence(a: string, b: string, given: string | null): [string, string] {
    const weight = (id: string): number => {
      const person = this.#kin.person(id);
      const branch = person?.branch ?? null;
      const hasPage = branch !== null && this.#pages.includes(branch);
      const isGiven = hasPage && branch === given;
      return (isGiven ? 4 : 0) + (hasPage ? 2 : 0) + (person?.sex === "male" ? 1 : 0);
    };
    return weight(b) > weight(a) ? [b, a] : [a, b];
  }

  #areParentAndChild(a: string, b: string): boolean {
    const isParent = (parent: string, child: string): boolean =>
      this.#kin.sets(child).some(({ known }) => known.includes(parent));
    return isParent(a, b) || isParent(b, a);
  }

  /** The page the couple was given, else that of the branch, else that of the nearest kin. */
  #findHomes(): void {
    const pageOf = new Map(this.#pages.map((branch, i) => [branch, i]));
    const queue: Unit[] = [];
    for (const unit of this.#units) {
      const { head, spouses } = unit;
      const given = this.#kin
        .unions(head)
        .filter(({ other }) => other === null || spouses.includes(other))
        .flatMap(({ all }) => all.map(({ branch }) => branch));
      const own = [head, ...spouses].map((id) => this.#kin.person(id)?.branch ?? null);
      for (const branch of [...given, ...own]) {
        const page = branch === null ? undefined : pageOf.get(branch);
        if (page === undefined) continue;
        unit.home = page;
        queue.push(unit);
        break;
      }
    }
    for (const unit of queue) {
      for (const near of this.#kinUnits(unit)) {
        if (near.home >= 0) continue;
        near.home = unit.home;
        queue.push(near);
      }
    }
    const homeless = this.#units.filter(({ home }) => home < 0);
    if (homeless.length === 0) return;
    for (const unit of homeless) unit.home = this.#pages.length;
    this.#pages.push(null);
  }

  #kinUnits({ head, spouses }: Unit): Unit[] {
    const ids = [head, ...spouses].flatMap((id) => [
      ...this.#kin.unions(id).flatMap(({ other }) => (other === null ? [] : [other])),
      ...this.#kin.sets(id).flatMap(({ known }) => known),
      ...this.#kin.children(id).map(({ child }) => child),
    ]);
    return ids.map((id) => this.#unit(id));
  }

  #unit(id: string): Unit {
    return this.#unitOf.get(id) as Unit;
  }

  #noteAbsentPartners(): void {
    for (const { a, b } of this.#kin.couples) {
      if (this.#standTogether(a, b)) continue;
      this.#noteAbsent(a, b);
      this.#noteAbsent(b, a);
    }
  }

  /** Two partners of one person stand in one unit and are still no couple in it. */
  #standTogether(a: string, b: string): boolean {
    const unit = this.#unit(a);
    return unit === this.#unit(b) && (unit.head === a || unit.head === b);
  }

  #noteAbsent(person: string, partner: string): void {
    const absent = listOf(this.#unit(person).elsewhere, person);
    if (!absent.includes(partner)) absent.push(partner);
  }

  /**
   * Every child stands once, under the parents who decide where; in the families of other parents
   * a reference stands instead.
   */
  #attachChildren(): void {
    for (const child of this.#kin.ids) {
      const unit = this.#unit(child);
      const sets = this.#kin.sets(child).filter(({ known }) => known.length > 0);
      sets.forEach((set, i) => {
        const host = this.#hostOf(set, unit.home);
        const isHere = i === 0 && this.#canStandUnder(host, child);
        if (isHere) {
          if (unit.head !== child) {
            unit.spouses = [unit.head];
            unit.head = child;
          }
          unit.above = host;
        }
        this.#familyOf(host, set).children.push({ child, set, isHere });
      });
    }
    for (const { families } of this.#units) {
      for (const { children } of families) {
        children.sort((a, b) => this.#kin.byBirth(a.child, b.child));
      }
    }
  }

  /** The unit that draws the line: where both parents stand, else the one on the page of the child. */
  #hostOf({ known }: ParentSet, home: number): Unit {
    const units = known.map((id) => this.#unit(id));
    return units.find((unit) => unit.home === home) ?? (units[0] as Unit);
  }

  #canStandUnder(host: Unit, child: string): boolean {
    const unit = this.#unit(child);
    if (unit === host || unit.home !== host.home || unit.above !== null) return false;
    // A partner may lead the couple under the parents when the head has no parents of its own.
    const mayLead =
      unit.spouses.length === 1 &&
      unit.elsewhere.size === 0 &&
      this.#kin.sets(unit.head).every(({ known }) => known.length === 0);
    if (unit.head !== child && !mayLead) return false;
    for (let above: Unit | null = host; above !== null; above = above.above) {
      if (above === unit) return false;
    }
    return true;
  }

  #familyOf(host: Unit, { known }: ParentSet): UnitFamily {
    const inside = known.filter((id) => this.#unit(id) === host);
    const [first, second] = inside as [string, string | undefined];
    const isCouple = second === undefined || this.#standTogether(first, second);
    const own = isCouple ? inside : [first];
    const absent = known.find((id) => !own.includes(id)) ?? null;
    if (absent !== null) this.#noteAbsent(own[0] as string, absent);
    const parents = absent === null ? own : [...own, absent];
    let family = host.families.find(
      (found) =>
        found.parents.length === parents.length &&
        found.parents.every((parent) => parents.includes(parent)),
    );
    if (family === undefined) host.families.push((family = { parents, absent, children: [] }));
    return family;
  }

  /** How many generations below the first each unit stands, as far as kinship tells. */
  #generations(): Map<Unit, { group: number; generation: number }> {
    const links = new Map<Unit, [Unit, number][]>();
    const link = (a: Unit, b: Unit, down: number): void => {
      if (a === b) return;
      listOf(links, a).push([b, down]);
      listOf(links, b).push([a, -down]);
    };
    for (const unit of this.#units) {
      for (const { children } of unit.families) {
        for (const { child, set } of children) {
          if (set.main) link(unit, this.#unit(child), 1);
        }
      }
      for (const partners of unit.elsewhere.values()) {
        for (const partner of partners) link(unit, this.#unit(partner), 0);
      }
    }
    const found = new Map<Unit, { group: number; generation: number }>();
    let group = 0;
    for (const start of this.#units) {
      if (found.has(start)) continue;
      found.set(start, { group, generation: 0 });
      const queue = [start];
      for (const unit of queue) {
        const { generation } = found.get(unit) as { generation: number };
        for (const [near, down] of links.get(unit) ?? []) {
          if (found.has(near)) continue;
          found.set(near, { group, generation: generation + down });
          queue.push(near);
        }
      }
      group += 1;
    }
    return found;
  }

  #lay(generations: Map<Unit, { group: number; generation: number }>): MapModel {
    const placeOf = (unit: Unit) => generations.get(unit) as { group: number; generation: number };
    const roots = this.#units.filter(({ above }) => above === null);
    // Generations are rows across all pages: the first generation of a family is its first row.
    const firsts = new Map<string, number>();
    const firstOf = (unit: Unit): string => String(placeOf(unit).group);
    for (const root of roots) {
      const { generation } = placeOf(root);
      firsts.set(firstOf(root), Math.min(firsts.get(firstOf(root)) ?? Infinity, generation));
    }
    const rowOf = (root: Unit): number =>
      placeOf(root).generation - (firsts.get(firstOf(root)) ?? 0);
    roots.sort(
      (a, b) =>
        a.home - b.home ||
        placeOf(a).group - placeOf(b).group ||
        rowOf(a) - rowOf(b) ||
        a.index - b.index,
    );

    const model: MapModel = {
      pages: this.#pages,
      nodes: [],
      links: [],
      unions: [],
      crossings: [],
    };
    const queue: { unit: Unit; node: MapNode }[] = [];
    const enter = (unit: Unit, parent: MapNode | null, generation: number): MapNode => {
      const node: MapNode = {
        page: unit.home,
        generation,
        isList: false,
        rows: this.#rowsOf(unit),
        children: [],
        parent,
        exits: [],
      };
      model.nodes.push(node);
      queue.push({ unit, node });
      return node;
    };
    for (const root of roots) enter(root, null, rowOf(root));
    for (const { unit, node } of queue) this.#layFamilies(unit, node, { model, enter });
    this.#addUnions(model);
    return model;
  }

  #rowsOf(unit: Unit): MapRow[] {
    const { head, spouses, above, elsewhere, home } = unit;
    const rows: MapRow[] = [];
    const parents = this.#kin.sets(head).find(({ known }) => known.length > 0);
    if (above === null && parents !== undefined) {
      const people = parents.known;
      const page = this.#pages[this.#hostOf(parents, home).home] ?? null;
      const reference = { as: "parents" as const, people, page };
      rows.push(this.#referenceRow(`parents ${head}`, reference, 0));
    }
    const addMember = (person: string, level: number): void => {
      rows.push({
        key: personKey(person),
        person,
        level,
        isSpouse: level > 0,
        direct: this.#line.has(person),
      });
      for (const partner of elsewhere.get(person) ?? []) {
        const page = this.#pages[this.#unit(partner).home] ?? null;
        const reference = { as: "partner" as const, people: [partner], page };
        rows.push(this.#referenceRow(partnerName(person, partner), reference, level + 1));
      }
    };
    addMember(head, 0);
    for (const spouse of spouses) addMember(spouse, 1);
    return rows;
  }

  #referenceRow(name: string, reference: Reference, level: number): MapRow {
    const isSpouse = reference.as === "partner";
    return { key: `r:${name}`, person: null, reference, level, isSpouse, direct: false };
  }

  #layFamilies(
    unit: Unit,
    node: MapNode,
    {
      model,
      enter,
    }: {
      model: MapModel;
      enter: (unit: Unit, parent: MapNode, generation: number) => MapNode;
    },
  ): void {
    const families = unit.families.map((family) => {
      const { parents, absent } = family;
      const keys = parents.map(personKey);
      const own = keys.slice(0, absent === null ? keys.length : -1);
      const reference =
        absent === null ? undefined : `r:${partnerName(parents[0] as string, absent)}`;
      const places = (reference === undefined ? own : [reference]).map((key) =>
        node.rows.findIndex((row) => row.key === key),
      );
      return { family, keys, reference, row: Math.max(...places) };
    });
    // The couple of the last row leaves below, after everybody who leaves on the right.
    families.sort((a, b) => a.row - b.row || a.keys.length - b.keys.length);
    const exits = families.map(({ row, keys }) => ({ row, family: nameOf(keys) }));
    node.exits = exits.at(-1)?.row === node.rows.length - 1 ? exits.slice(0, -1) : exits;

    for (const { family, keys, reference, row } of families) {
      const name = nameOf(keys);
      let list: MapNode | null = null;
      for (const { child, set, isHere } of family.children) {
        const childUnit = this.#unit(child);
        const isLone = !isHere || this.#isLone(childUnit);
        if (isLone && list === null) {
          list = this.#newList(node);
          model.nodes.push(list);
          node.children.push(list);
        }
        let to: MapLink["to"];
        if (!isHere && list !== null) {
          const page = this.#pages[childUnit.home] ?? null;
          const entry = { as: "child" as const, people: [child], page };
          to = { node: list, row: list.rows.length };
          const key = JSON.stringify([unit.head, child, set.main, set.kind, keys]);
          list.rows.push(this.#referenceRow(`child ${key}`, entry, 0));
        } else if (isLone && list !== null) {
          to = { node: list, row: list.rows.length };
          list.rows.push(...this.#rowsOf(childUnit));
        } else {
          list = null;
          to = { node: enter(childUnit, node, node.generation + 1), row: 0 };
          node.children.push(to.node);
        }
        const ties = set.members.flatMap(({ parent, certainty }) =>
          parent === null ? [] : [{ parent: personKey(parent), certainty }],
        );
        const link: MapLink = {
          type: "parentage",
          parents: keys,
          child: personKey(child),
          kind: set.kind,
          main: set.main,
          ties,
          certainty: leastSure(ties.map(({ certainty }) => certainty)),
          family: name,
          tree: isHere,
          direct: isOfLine(set) && this.#line.has(child),
          from: { node, row },
          to,
        };
        if (reference !== undefined) link.parentsAt = reference;
        const at = to.node.rows[to.row];
        if (!isHere && at !== undefined) link.childAt = at.key;
        model.links.push(link);
        if (link.direct) this.#addCrossings(model, link, family);
      }
    }
  }

  /** The direct line goes on from a reference to the person it names. */
  #addCrossings(
    { crossings }: MapModel,
    { family, certainty, childAt, parentsAt, child }: MapLink,
    { absent }: UnitFamily,
  ): void {
    const add = (reference: string, to: string, own: string): void => {
      if (crossings.some((crossing) => crossing.reference === reference)) return;
      crossings.push({ reference, to, family: own, certainty });
    };
    if (childAt !== undefined) add(childAt, child, family);
    if (parentsAt !== undefined && absent !== null) {
      add(parentsAt, personKey(absent), `x:${parentsAt}`);
    }
  }

  /** Nobody stands with the person and nobody below. */
  #isLone({ spouses, elsewhere, families }: Unit): boolean {
    return spouses.length === 0 && elsewhere.size === 0 && families.length === 0;
  }

  #newList(parent: MapNode): MapNode {
    return {
      page: parent.page,
      generation: parent.generation + 1,
      isList: true,
      rows: [],
      children: [],
      parent,
      exits: [],
    };
  }

  #addUnions({ unions }: MapModel): void {
    for (const { union, a, b } of this.#kin.couples) {
      const { id, kind, certainty } = union;
      const base = {
        type: "union" as const,
        union: id,
        kind,
        certainty,
        family: `u:${id}`,
        direct: false,
      };
      const isTogether = this.#standTogether(a, b);
      for (const [one, other] of isTogether
        ? [[a, b] as const]
        : [[a, b] as const, [b, a] as const]) {
        const partners: [string, string] = [personKey(one), personKey(other)];
        unions.push(
          isTogether
            ? { ...base, partners }
            : { ...base, partners, at: `r:${partnerName(one, other)}` },
        );
      }
    }
  }
}

const nameOf = (parents: string[]): string => `s:${JSON.stringify([...parents].sort())}`;

const partnerName = (person: string, partner: string): string =>
  `partner ${JSON.stringify([person, partner])}`;
