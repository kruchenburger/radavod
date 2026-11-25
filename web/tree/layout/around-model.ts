import type { TreeSnapshot } from "../../../src/shared/tree";
import { isOfLine, type Kin, kinOf, type ParentSet } from "./kin";
import {
  type ParentageLink,
  personKey,
  type Reference,
  type ReferenceLink,
  type UnionLink,
  type UnknownPlace,
} from "./types";

/** Who stands around a person and how they hang together, before anything has a place. */
export type Model = {
  focus: Entry;
  partners: Entry[];
  /** The one union of three and more whose family is unfolded. */
  open: string | null;
  siblings: { older: Entry[]; younger: Entry[] };
  /** Everybody who shares a parent with the person, drawn or not. */
  siblingIds: string[];
  up: UpNode[];
  families: Family[];
  /** Kin who hang on somebody standing on the other side, for example on a wife who is a grandchild. */
  strayUp: UpNode[];
  strayDown: DownNode[];
  entries: Map<string, Entry>;
  links: ModelLink[];
  unions: ModelUnion[];
  references: ModelReference[];
};

export type Role =
  "focus" | "partner" | "sibling" | "ancestor" | "descendant" | "unknown" | "reference";

export type Entry = {
  key: string;
  person: string | null;
  unknown?: UnknownPlace;
  reference?: Reference;
  role: Role;
  generation: number;
  direct: boolean;
  /** Stands under somebody as a partner in a union. */
  isSpouse: boolean;
  /** How many descendants are folded behind. */
  folded?: number;
};

/** A parent with the parents above. */
export type UpNode = {
  entry: Entry;
  above: UpNode[];
  /** Starts a new set of parents. */
  isFirst: boolean;
};

/** A descendant with the partners, and the children by every one of them. */
export type DownNode = { cards: Entry[]; families: Family[] };

export type Family = {
  /** The cards its line leaves: both of a couple, or the one it hangs on. */
  from: string[];
  children: DownNode[];
};

export type ModelLink = Omit<ParentageLink, "points"> & { from: string[] };
export type ModelUnion = Omit<UnionLink, "points"> & { isTogether: boolean };
export type ModelReference = Omit<ReferenceLink, "points">;

export type Reach = {
  /** Generations up, 3 by default. */
  up?: number;
  /** Generations down, 3 by default. */
  down?: number;
  /** Whether siblings are unfolded. */
  siblings?: boolean;
  /** Whose ancestors are the direct line. */
  lineOf?: string | null;
  /** The key of the partner whose family is unfolded, when there are three and more. */
  open?: string | null;
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
  readonly #references: ModelReference[] = [];
  /** Parent and child keys that have a line already. */
  readonly #linked = new Set<string>();
  /** Couples whose cards stand together, by the family their children are in. */
  readonly #couples = new Map<string, { hasArms: boolean; from: string[] }>();

  constructor(kin: Kin, focus: string, reach: Reach) {
    this.#kin = kin;
    this.#focus = focus;
    this.#reach = { up: 3, down: 3, siblings: false, lineOf: null, open: null, ...reach };
    const line = kin.lineOf(this.#reach.lineOf);
    this.#line = line.has(focus) ? line : new Set();
  }

  build(): Model {
    const focus = this.#enter(this.#focus, "focus", 0);
    const partners = this.#enterPartners(this.#focus, 0);
    for (const { key } of partners) {
      this.#couples.set(familyOf([focus.key, key]), { hasArms: false, from: [key] });
    }
    const open = partners.length < 3 ? null : this.#chooseOpen(partners);
    const { up, strayUp } = this.#climb();
    const { siblings, siblingIds } = this.#enterSiblings();
    const top: DownNode = { cards: [focus, ...partners], families: [] };
    const strayDown = this.#descend(top, open);
    this.#addSecondLines();
    return {
      focus,
      partners,
      open,
      siblings,
      siblingIds,
      up,
      families: top.families,
      strayUp,
      strayDown,
      entries: this.#entries,
      links: this.#links,
      unions: this.#unions(),
      references: this.#references,
    };
  }

  #enter(person: string, role: Role, generation: number, isSpouse = false): Entry {
    const key = personKey(person);
    const entry = { key, person, role, generation, direct: this.#line.has(person), isSpouse };
    this.#entries.set(key, entry);
    return entry;
  }

  #enterPlace(
    place: { unknown: UnknownPlace } | { reference: Reference },
    name: string,
    generation: number,
  ): Entry {
    const isUnknown = "unknown" in place;
    const base = `${isUnknown ? "?" : "r"}:${name}`;
    // Ids may repeat in a broken snapshot.
    let key = base;
    for (let i = 2; this.#entries.has(key); i += 1) key = `${base} ${i}`;
    const entry: Entry = {
      key,
      person: null,
      role: isUnknown ? "unknown" : "reference",
      generation,
      direct: false,
      isSpouse: isUnknown && place.unknown.of === "partner",
      ...place,
    };
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
        const unknown = { of: "partner" as const, partner: person, union: union.id };
        entered.push(this.#enterPlace({ unknown }, `partner ${union.id}`, generation));
      } else if (!this.#has(other)) entered.push(this.#enter(other, role, generation, true));
    }
    for (const { set } of this.#kin.children(person)) {
      for (const other of set.known) {
        if (!this.#has(other)) entered.push(this.#enter(other, role, generation));
      }
    }
    return entered;
  }

  /** The family asked for, else the one on the direct line, else the first with children. */
  #chooseOpen(partners: Entry[]): string {
    const asked = partners.find(({ key }) => key === this.#reach.open);
    const children = this.#kin.children(this.#focus);
    const hasChildren = (
      { key }: Entry,
      isWanted: (child: string) => boolean = () => true,
    ): boolean =>
      children.some(({ child, set }) => isWanted(child) && this.#partnerOf(set, partners) === key);
    const chosen =
      asked ??
      partners.find((partner) => hasChildren(partner, (child) => this.#line.has(child))) ??
      partners.find((partner) => hasChildren(partner)) ??
      partners[0];
    return chosen?.key ?? "";
  }

  /** The card of the other parent among those who stand with the person. */
  #partnerOf(set: ParentSet, cards: Entry[], person = this.#focus): string | undefined {
    const other = set.known.find((id) => id !== person);
    if (other !== undefined) return cards.find((card) => card.person === other)?.key;
    if (set.unknown.length === 0) return undefined;
    return cards.find(({ unknown }) => unknown?.of === "partner")?.key;
  }

  #link(set: ParentSet, link: Pick<ModelLink, "parents" | "from" | "tree"> & Partial<ModelLink>) {
    const { kind, main, certainty } = set;
    const child = personKey(set.child);
    this.#links.push({
      type: "parentage",
      child,
      kind,
      main,
      certainty,
      family: familyOf(link.parents),
      direct: isOfLine(set) && this.#line.has(set.child),
      ...link,
    });
    for (const parent of link.parents) this.#linked.add(`${parent} ${child}`);
  }

  /** Ancestors, generation by generation: everybody stands as near as they can. */
  #climb(): { up: UpNode[]; strayUp: UpNode[] } {
    const up: UpNode[] = [];
    const strayUp: UpNode[] = [];
    const seen = new Set([this.#focus]);
    let front: { person: string; above: UpNode[] | null }[] = [{ person: this.#focus, above: up }];
    for (let generation = -1; generation >= -this.#reach.up; generation -= 1) {
      const next: typeof front = [];
      const reach = (parent: string, above: UpNode[] | null): void => {
        if (!seen.has(parent)) next.push({ person: parent, above });
        seen.add(parent);
      };
      for (const { person, above } of front) {
        for (const set of this.#kin.sets(person)) {
          if (above === null) {
            for (const parent of set.known) {
              if (this.#has(parent)) {
                reach(parent, null);
                continue;
              }
              const node = this.#upNode(this.#enter(parent, "ancestor", generation), true);
              strayUp.push(node);
              reach(parent, node.above);
            }
            continue;
          }
          const nodes = this.#climbSet(set, generation, reach);
          nodes.forEach((node, i) => (node.isFirst = i === 0));
          above.push(...nodes);
        }
      }
      front = next;
    }
    return { up, strayUp };
  }

  #upNode(entry: Entry, isFirst = false): UpNode {
    return { entry, above: [], isFirst };
  }

  /** Parents of one set: their cards, places of unknown ones, references to those drawn before. */
  #climbSet(
    set: ParentSet,
    generation: number,
    reach: (parent: string, above: UpNode[] | null) => void,
  ): UpNode[] {
    const { child, members, known } = set;
    const again = known.filter((parent) => this.#has(parent));
    const isCouple = again.length > 1 && this.#couples.has(familyOf(again.map(personKey)));
    const named = new Set<string>();
    const nodes: UpNode[] = [];
    const links: Pick<ModelLink, "parents" | "parentsAt">[] = [];
    for (const { parent, id: parentage } of members) {
      if (parent === null) {
        if (known.length === 0 && nodes.length > 0) continue;
        const parentages = known.length === 0 ? set.unknown : [parentage];
        const unknown = { of: "parent" as const, child, parentages };
        const entry = this.#enterPlace({ unknown }, `parent ${child} ${parentage}`, generation);
        nodes.push(this.#upNode(entry));
        links.push({ parents: [entry.key] });
        continue;
      }
      if (again.includes(parent)) {
        if (named.has(parent)) continue;
        const people = isCouple ? again : [parent];
        for (const person of people) {
          named.add(person);
          reach(person, null);
        }
        const reference = { as: "parents" as const, people, page: null };
        const entry = this.#enterPlace({ reference }, `parents ${child} ${parent}`, generation);
        nodes.push(this.#upNode(entry));
        const parents = people.map(personKey);
        links.push({ parents, parentsAt: entry.key });
        this.#references.push({
          type: "reference",
          reference: entry.key,
          to: parents,
          family: entry.key,
          certainty: set.certainty,
          direct: false,
        });
        continue;
      }
      const node = this.#upNode(this.#enter(parent, "ancestor", generation));
      nodes.push(node);
      reach(parent, node.above);
      links.push({ parents: [node.entry.key] });
    }
    const keys = nodes.map(({ entry }) => entry.key);
    const family = familyOf(keys);
    if (nodes.length > 1 && nodes.every(({ entry }) => entry.reference === undefined)) {
      this.#couples.set(family, { hasArms: true, from: keys });
    }
    links.forEach((link, i) => {
      const from = [keys[i] as string];
      this.#link(set, { ...link, from, family, tree: link.parentsAt === undefined });
    });
    return nodes;
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
      siblings[isOlder ? "older" : "younger"].push(this.#enter(id, "sibling", 0));
      this.#linkToParents(id, (parent) => this.#entries.get(parent)?.generation === -1);
    }
    return { siblings, siblingIds };
  }

  /** Lines from every parent who is drawn and has none yet. */
  #linkToParents(child: string, decides: (parent: string) => boolean): void {
    for (const set of this.#kin.sets(child)) {
      const missing = set.known
        .map(personKey)
        .filter((key) => this.#entries.has(key) && !this.#linked.has(`${key} ${personKey(child)}`));
      const family = familyOf(missing);
      const tree = missing.some(decides);
      const couple = missing.length > 1 ? this.#couples.get(family) : undefined;
      if (couple?.hasArms === false) {
        this.#link(set, { parents: missing, from: couple.from, tree });
        continue;
      }
      for (const key of missing) {
        const own = couple === undefined ? familyOf([key]) : family;
        this.#link(set, { parents: [key], from: [key], family: own, tree: decides(key) });
      }
    }
  }

  #addSecondLines(): void {
    for (const { person } of this.#entries.values()) {
      if (person !== null) this.#linkToParents(person, () => false);
    }
  }

  /** Descendants, generation by generation: blood kin take their places before partners do. */
  #descend(top: DownNode, open: string | null): DownNode[] {
    const strays: DownNode[] = [];
    const seen = new Set([this.#focus]);
    let front: { person: string; node: DownNode | null }[] = [{ person: this.#focus, node: top }];
    for (let generation = 1; generation <= this.#reach.down; generation += 1) {
      const next: typeof front = [];
      for (const { person, node } of front) {
        for (const { child, set } of this.#kin.children(person)) {
          if (seen.has(child)) continue;
          seen.add(child);
          const partner = node === null ? undefined : this.#partnerOf(set, node.cards, person);
          const isFolded =
            node === top && open !== null && partner !== undefined && partner !== open;
          if (this.#has(child)) {
            if (!isFolded) next.push({ person: child, node: null });
            continue;
          }
          const entry = this.#enter(child, "descendant", generation);
          const own: DownNode = { cards: [entry], families: [] };
          if (isFolded) entry.folded = this.#countDescendants(child);
          else next.push({ person: child, node: own });
          if (node === null) strays.push(own);
          else this.#addChild(node, person, set, own);
        }
      }
      for (const { person, node } of next) {
        const partners = this.#enterPartners(person, generation);
        if (node === null) {
          if (partners.length > 0) strays.push({ cards: partners, families: [] });
          continue;
        }
        node.cards.push(...partners);
        const own = personKey(person);
        for (const { key } of partners) {
          const from = partners.length === 1 ? [own, key] : [key];
          this.#couples.set(familyOf([own, key]), { hasArms: false, from });
        }
      }
      front = next;
    }
    for (const node of [top, ...strays]) sortFamilies(node);
    return strays;
  }

  #addChild(node: DownNode, person: string, set: ParentSet, child: DownNode): void {
    const own = personKey(person);
    const partner = this.#partnerOf(set, node.cards, person);
    const parents = partner === undefined ? [own] : [own, partner];
    const couple = this.#couples.get(familyOf(parents));
    const from = partner === undefined || couple === undefined ? [own] : couple.from;
    let family = node.families.find((found) => found.from.join(" ") === from.join(" "));
    if (family === undefined) node.families.push((family = { from, children: [] }));
    family.children.push(child);
    this.#link(set, { parents, from, tree: true });
  }

  #countDescendants(person: string): number {
    const found = new Set([person]);
    for (const id of found) for (const { child } of this.#kin.children(id)) found.add(child);
    return found.size - 1;
  }

  #unions(): ModelUnion[] {
    const unions: ModelUnion[] = [];
    const add = (
      { id, kind, certainty }: Kin["couples"][number]["union"],
      partners: [string, string],
    ): void => {
      unions.push({
        type: "union",
        union: id,
        partners,
        kind,
        certainty,
        family: `u:${id}`,
        direct: false,
        isTogether: this.#couples.has(familyOf(partners)),
      });
    };
    for (const { union, a, b } of this.#kin.couples) {
      if (this.#has(a) && this.#has(b)) add(union, [personKey(a), personKey(b)]);
    }
    for (const { unknown, key } of this.#entries.values()) {
      if (unknown?.of !== "partner") continue;
      const { partner } = unknown;
      const own = this.#kin.unions(partner).find(({ union }) => union.id === unknown.union);
      if (own !== undefined) add(own.union, [personKey(partner), key]);
    }
    return unions;
  }
}

/** Children by one person before those by the next partner, as their cards stand. */
function sortFamilies({ cards, families }: DownNode): void {
  const place = ({ from }: Family): number =>
    Math.max(...from.map((key) => cards.findIndex((card) => card.key === key)));
  families.sort((a, b) => place(a) - place(b));
  for (const { children } of families) children.forEach(sortFamilies);
}

const familyOf = (keys: string[]): string => `s:${JSON.stringify([...keys].sort())}`;
