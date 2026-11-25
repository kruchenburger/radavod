import type { TreeSnapshot } from "../../../src/shared/tree";
import { isOfLine, type Kin, kinOf, type ParentSet } from "./kin";
import { type ParentageLink, personKey, type UnionLink, type UnknownPlace } from "./types";

/** Who stands around a person and how they hang together, before anything has a place. */
export type Model = {
  focus: Entry;
  partners: Entry[];
  siblings: { older: Entry[]; younger: Entry[] };
  /** Everybody who shares a parent with the person, drawn or not. */
  siblingIds: string[];
  up: UpNode[];
  families: Family[];
  /** Kin who hang on somebody standing on the other side, for example a wife who is a grandchild. */
  strayUp: UpNode[];
  strayDown: DownNode[];
  entries: Map<string, Entry>;
  links: ModelLink[];
  unions: ModelUnion[];
};

export type Role = "focus" | "partner" | "sibling" | "ancestor" | "descendant" | "unknown";

export type Entry = {
  key: string;
  person: string | null;
  unknown?: UnknownPlace;
  role: Role;
  generation: number;
  direct: boolean;
};

/** A parent with the parents above. */
export type UpNode = { entry: Entry; above: UpNode[]; /** Starts a new set. */ first: boolean };

/** A descendant with the partners, and the children by every one of them. */
export type DownNode = { cards: Entry[]; families: Family[] };

export type Family = { from: string[]; children: DownNode[] };

export type ModelLink = Omit<ParentageLink, "points"> & {
  /** Cards the line leaves: both of a couple, or the one it hangs on. */
  from: string[];
};

export type ModelUnion = Omit<UnionLink, "points"> & { together: boolean };

export type Reach = {
  /** Generations up, 3 by default. */
  up?: number;
  /** Generations down, 3 by default. */
  down?: number;
  /** Whether siblings are unfolded. */
  siblings?: boolean;
  /** Whose ancestors are the direct line. */
  lineOf?: string | null;
};

export function modelOf(snapshot: TreeSnapshot, focus: string, reach: Reach): Model | null {
  const kin = kinOf(snapshot);
  return kin.person(focus) === undefined ? null : new Builder(kin, focus, reach).build();
}

class Builder {
  readonly #kin: Kin;
  readonly #focus: string;
  readonly #reach: Required<Reach>;
  readonly #line: Set<string>;
  readonly #entries = new Map<string, Entry>();
  readonly #links: ModelLink[] = [];
  /** Parent and child keys that have a line already. */
  readonly #linked = new Set<string>();
  /** Couples whose cards stand together, by the family their children are in. */
  readonly #couples = new Map<string, { arms: boolean; from: string[] }>();

  constructor(kin: Kin, focus: string, { up = 3, down = 3, siblings = false, lineOf = null }: Reach) {
    this.#kin = kin;
    this.#focus = focus;
    this.#reach = { up, down, siblings, lineOf };
    const line = kin.lineOf(lineOf);
    this.#line = line.has(focus) ? line : new Set();
  }

  build(): Model {
    const focus = this.#enter(this.#focus, "focus", 0);
    const partners = this.#enterPartners(this.#focus, 0);
    const block = [focus, ...partners];
    this.#joinBlock(block);
    const { up, strayUp } = this.#climb();
    const { siblings, siblingIds } = this.#enterSiblings();
    const { families, strayDown } = this.#descend(block);
    this.#addSecondLines();
    return {
      focus,
      partners,
      siblings,
      siblingIds,
      up,
      families,
      strayUp,
      strayDown,
      entries: this.#entries,
      links: this.#links,
      unions: this.#unions(),
    };
  }

  #enter(person: string, role: Role, generation: number): Entry {
    const key = personKey(person);
    const entry = { key, person, role, generation, direct: this.#line.has(person) };
    this.#entries.set(key, entry);
    return entry;
  }

  #enterUnknown(unknown: UnknownPlace, generation: number): Entry {
    const id = unknown.of === "parent" ? `${unknown.child} ${unknown.parentage}` : unknown.union;
    // Two parentages of a child may have one id in a broken snapshot.
    let key = `?:${unknown.of} ${id}`;
    while (this.#entries.has(key)) key += "+";
    const entry: Entry = { key, person: null, unknown, role: "unknown", generation, direct: false };
    this.#entries.set(key, entry);
    return entry;
  }

  #has(person: string): boolean {
    return this.#entries.has(personKey(person));
  }

  /** Partners who stand nowhere yet, in the order of the unions, then the other parents. */
  #enterPartners(person: string, generation: number): Entry[] {
    const role = generation === 0 ? "partner" : "descendant";
    const entered: Entry[] = [];
    for (const { union, other } of this.#kin.unions(person)) {
      if (other === null) {
        const place = { of: "partner" as const, partner: person, union: union.id };
        entered.push(this.#enterUnknown(place, generation));
      } else if (!this.#has(other)) entered.push(this.#enter(other, role, generation));
    }
    for (const { set } of this.#kin.children(person)) {
      for (const other of set.known) {
        if (!this.#has(other)) entered.push(this.#enter(other, role, generation));
      }
    }
    return entered;
  }

  #joinBlock([person, ...partners]: Entry[]): void {
    if (person === undefined) return;
    for (const partner of partners) {
      const from = partners.length === 1 ? [person.key, partner.key] : [partner.key];
      this.#couples.set(familyOf([person.key, partner.key]), { arms: false, from });
    }
  }

  #link(set: ParentSet, parents: string[], tree: boolean, from = parents, family = familyOf(parents)) {
    const { kind, main, certainty } = set;
    const child = personKey(set.child);
    this.#links.push({
      type: "parentage",
      parents,
      child,
      kind,
      main,
      certainty,
      tree,
      from,
      family,
      direct: isOfLine(set) && this.#line.has(set.child),
    });
    for (const parent of parents) this.#linked.add(`${parent} ${child}`);
  }

  /** Ancestors, generation by generation: everybody stands as near as they can. */
  #climb(): { up: UpNode[]; strayUp: UpNode[] } {
    const up: UpNode[] = [];
    const strayUp: UpNode[] = [];
    const seen = new Set([this.#focus]);
    let front: { person: string; above: UpNode[] | null }[] = [{ person: this.#focus, above: up }];
    for (let generation = -1; generation >= -this.#reach.up; generation -= 1) {
      const next: typeof front = [];
      for (const { person, above } of front) {
        for (const set of this.#kin.sets(person)) {
          const nodes: UpNode[] = [];
          const isNew = new Map<string, UpNode | null>();
          for (const { parent, parentage } of set.members) {
            if (parent === null) {
              if (above === null) continue;
              const place = { of: "parent" as const, child: person, parentage };
              const entry = this.#enterUnknown(place, generation);
              nodes.push({ entry, above: [], first: nodes.length === 0 });
              continue;
            }
            if (seen.has(parent)) continue;
            seen.add(parent);
            let node: UpNode | null = null;
            if (!this.#has(parent)) {
              const entry = this.#enter(parent, "ancestor", generation);
              node = { entry, above: [], first: nodes.length === 0 || above === null };
              if (above === null) strayUp.push(node);
              else nodes.push(node);
            }
            isNew.set(parent, node);
          }
          for (const [parent, node] of isNew) next.push({ person: parent, above: node?.above ?? null });
          if (above === null || nodes.length === 0) continue;
          above.push(...nodes);
          const keys = nodes.map(({ entry }) => entry.key);
          const family = familyOf(keys);
          if (keys.length > 1) this.#couples.set(family, { arms: true, from: keys });
          for (const key of keys) this.#link(set, [key], true, [key], family);
        }
      }
      front = next;
    }
    return { up, strayUp };
  }

  #enterSiblings(): Pick<Model, "siblings" | "siblingIds"> {
    const siblings: Model["siblings"] = { older: [], younger: [] };
    if (this.#reach.up < 1) return { siblings, siblingIds: [] };
    const parents = this.#kin.sets(this.#focus).flatMap(({ known }) => known);
    const ids = new Set(parents.flatMap((id) => this.#kin.children(id).map(({ child }) => child)));
    ids.delete(this.#focus);
    const siblingIds = [...ids].sort(this.#kin.byBirth);
    if (!this.#reach.siblings) return { siblings, siblingIds };
    for (const id of siblingIds) {
      if (this.#has(id)) continue;
      const isOlder = this.#kin.byBirth(id, this.#focus) < 0;
      const entry = this.#enter(id, "sibling", 0);
      siblings[isOlder ? "older" : "younger"].push(entry);
      this.#linkToParents(id, true);
    }
    return { siblings, siblingIds };
  }

  /** Lines from every parent who is drawn and has none yet. */
  #linkToParents(child: string, tree: boolean): void {
    for (const set of this.#kin.sets(child)) {
      const missing = set.known
        .map(personKey)
        .filter((key) => this.#entries.has(key) && !this.#linked.has(`${key} ${personKey(child)}`));
      const family = familyOf(missing);
      const couple = missing.length > 1 ? this.#couples.get(family) : undefined;
      if (couple?.arms === false) {
        this.#link(set, missing, tree, couple.from, family);
        continue;
      }
      for (const key of missing) {
        this.#link(set, [key], tree, [key], couple === undefined ? familyOf([key]) : family);
      }
    }
  }

  #addSecondLines(): void {
    for (const { person } of this.#entries.values()) {
      if (person !== null) this.#linkToParents(person, false);
    }
  }

  /** Descendants, generation by generation: the blood kin take their places before partners do. */
  #descend(block: Entry[]): { families: Family[]; strayDown: DownNode[] } {
    const top: DownNode = { cards: block, families: [] };
    const strayDown: DownNode[] = [];
    const seen = new Set([this.#focus]);
    let front: { person: string; node: DownNode | null }[] = [{ person: this.#focus, node: top }];
    for (let generation = 1; generation <= this.#reach.down; generation += 1) {
      const next: typeof front = [];
      for (const { person, node } of front) {
        for (const { child, set } of this.#kin.children(person)) {
          if (seen.has(child)) continue;
          seen.add(child);
          if (this.#has(child)) {
            next.push({ person: child, node: null });
            continue;
          }
          const own: DownNode = {
            cards: [this.#enter(child, "descendant", generation)],
            families: [],
          };
          next.push({ person: child, node: own });
          if (node === null) strayDown.push(own);
          else this.#addChild(node, person, set, own);
        }
      }
      for (const entry of next) {
        const partners = this.#enterPartners(entry.person, generation);
        if (entry.node === null) {
          if (partners.length > 0) strayDown.push({ cards: partners, families: [] });
        } else {
          entry.node.cards.push(...partners);
          this.#joinBlock(entry.node.cards);
        }
      }
      front = next;
    }
    for (const node of [top, ...strayDown]) sortFamilies(node);
    return { families: top.families, strayDown };
  }

  #addChild(node: DownNode, person: string, set: ParentSet, child: DownNode): void {
    const keys = node.cards.map(({ key }) => key);
    const own = personKey(person);
    const other = set.known.find((id) => id !== person);
    const stranger =
      other === undefined && set.unknown.length > 0
        ? node.cards.find(({ unknown }) => unknown?.of === "partner")?.key
        : undefined;
    const partner = other === undefined ? stranger : personKey(other);
    const parents =
      partner !== undefined && keys.includes(partner) ? [own, partner] : [own];
    const from =
      parents.length === 1 ? parents : (this.#couples.get(familyOf(parents))?.from ?? [own]);
    let family = node.families.find((found) => found.from.join(" ") === from.join(" "));
    if (family === undefined) node.families.push((family = { from, children: [] }));
    family.children.push(child);
    this.#link(set, parents, true, from);
  }

  #unions(): ModelUnion[] {
    const unions: ModelUnion[] = [];
    const add = (union: Omit<ModelUnion, "type" | "family" | "direct">): void => {
      unions.push({ ...union, type: "union", family: `u:${union.union}`, direct: false });
    };
    for (const { union, a, b } of this.#kin.couples) {
      const keys: [string, string] = [personKey(a), personKey(b)];
      if (!keys.every((key) => this.#entries.has(key))) continue;
      const { id, kind, certainty } = union;
      const together = this.#couples.has(familyOf(keys));
      add({ union: id, partners: keys, kind, certainty, together });
    }
    for (const { unknown, key } of this.#entries.values()) {
      if (unknown?.of !== "partner") continue;
      const own = this.#kin.unions(unknown.partner).find(({ union }) => union.id === unknown.union);
      if (own === undefined) continue;
      const { id, kind, certainty } = own.union;
      const keys: [string, string] = [personKey(unknown.partner), key];
      add({ union: id, partners: keys, kind, certainty, together: this.#couples.has(familyOf(keys)) });
    }
    return unions;
  }
}

/** The children by one person before those by the next partner, as their cards stand. */
function sortFamilies({ cards, families }: DownNode): void {
  const place = ({ from }: Family): number =>
    Math.max(...from.map((key) => cards.findIndex((card) => card.key === key)));
  families.sort((a, b) => place(a) - place(b));
  for (const { children } of families) children.forEach(sortFamilies);
}

const familyOf = (keys: string[]): string => `s:${JSON.stringify([...keys].sort())}`;
