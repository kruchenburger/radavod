import type { TreeSnapshot } from "../../../src/shared/tree";
import { type DownNode, type Entry, type Model, modelOf, type Reach, type Role } from "./around-model";
import { type AroundMetrics, aroundMetrics, textsOf } from "./around-text";
import { drawLines } from "./around-lines";
import type { UpNode } from "./around-model";
import type { Card, Layout, Line, Measure, Wording } from "./types";

export type AroundOptions = Reach & {
  measure: Measure;
  wording: Wording;
  metrics?: Partial<AroundMetrics>;
};

export type AroundCard = Card & {
  role: Role;
  /** Below zero for ancestors, above for descendants. */
  generation: number;
  lines: Line[];
  /** Under somebody as a partner in a union: the sign of a union stands before the name. */
  isSpouse: boolean;
  /** How many descendants are folded behind. */
  folded?: number;
};

export type AroundLayout = Omit<Layout, "cards"> & {
  cards: AroundCard[];
  focus: string | null;
  columns: { generation: number; x: number; w: number }[];
  /** Siblings by age, folded or not. */
  siblings: string[];
  /** The partner whose family is unfolded, when there are three and more. */
  open: string | null;
};

/**
 * Ancestors to the left, descendants to the right, the person with all partners in the strip
 * between. Somebody who belongs to several places stands once, in the nearest generation. Lines
 * turn only in the gaps between columns and cross a column only where it has no card.
 */
export function around(
  snapshot: TreeSnapshot,
  focus: string,
  options: AroundOptions,
): AroundLayout {
  const model = modelOf(snapshot, focus, options);
  if (model === null) return { ...emptyAround(), columns: [] };
  const metrics = { ...aroundMetrics, ...options.metrics };
  const texts = textsOf(snapshot, model, { ...options, metrics });
  const heights = new Map([...texts].map(([key, { h }]) => [key, h]));
  const rows = placeRows(model, heights, metrics);
  const { links, columns, width, height, shift } = drawLines(model, rows, metrics);
  const cards = [...model.entries.values()].map((entry): AroundCard => {
    const { y, h } = rows.get(entry.key) as Row;
    const { x, w } = columns.find(({ generation }) => generation === entry.generation) as {
      x: number;
      w: number;
    };
    return { ...entry, lines: texts.get(entry.key)?.lines ?? [], x, y: y + shift, w, h };
  });
  return {
    cards,
    links,
    columns,
    width,
    height,
    focus: model.focus.key,
    siblings: model.siblingIds,
    open: model.open,
    order: readingOrder(model),
  };
}

export const emptyAround = () => ({
  cards: [],
  links: [],
  width: 0,
  height: 0,
  focus: null,
  siblings: [],
  open: null,
  order: [],
});

export type Row = { y: number; h: number };
export type Rows = Map<string, Row>;

/** Places from top to bottom. Every family has a band of its own through all columns. */
function placeRows(model: Model, heights: Map<string, number>, metrics: AroundMetrics): Rows {
  const rows: Rows = new Map();
  const heightOf = ({ key }: Entry): number => heights.get(key) ?? 0;
  const stackHeight = (cards: Entry[]): number =>
    cards.reduce((sum, card) => sum + heightOf(card), (cards.length - 1) * metrics.join);
  const putStack = (cards: Entry[], top: number): void => {
    let y = top;
    for (const card of cards) {
      rows.set(card.key, { y, h: heightOf(card) });
      y += heightOf(card) + metrics.join;
    }
  };

  // The strip. The card of the person is at 0.
  const { older, younger } = model.siblings;
  putStack(older, -stackHeight(older) - metrics.join);
  putStack([model.focus, ...younger, ...model.partners], 0);

  const up = new UpStack(heightOf, metrics);
  const middle = metrics.anchor;
  up.place(model.up, middle, rows);
  const stray = up.height(model.strayUp);
  up.place(model.strayUp, middle + (up.height(model.up) + stray) / 2 + metrics.sets, rows);

  const downHeights = new Map<DownNode, number>();
  const groupsOf = ({ families }: DownNode): DownNode[][] =>
    families.map(({ children }) => children);
  const downHeight = (node: DownNode): number => {
    let height = downHeights.get(node);
    if (height === undefined) {
      const own = stackHeight(node.cards) + metrics.rows;
      downHeights.set(node, (height = Math.max(own, downStack(groupsOf(node)))));
    }
    return height;
  };
  const downStack = (groups: DownNode[][]): number =>
    groups.reduce(
      (sum, nodes) => nodes.reduce((rest, node) => rest + downHeight(node), sum),
      Math.max(0, groups.length - 1) * metrics.families,
    );
  const placeDown = (groups: DownNode[][], top: number): void => {
    let y = top;
    for (const nodes of groups) {
      for (const node of nodes) {
        const height = downHeight(node);
        putStack(node.cards, y + (height - stackHeight(node.cards)) / 2);
        const own = groupsOf(node);
        placeDown(own, y + (height - downStack(own)) / 2);
        y += height;
      }
      y += metrics.families;
    }
  };
  const groups = model.families.map(({ children }) => children);
  const sources = model.families.flatMap(({ from }) =>
    from.map((key) => {
      const { y, h } = rows.get(key) as Row;
      return key === model.focus.key ? y + middle : y + h / 2;
    }),
  );
  const center = sources.length === 0 ? middle : (Math.min(...sources) + Math.max(...sources)) / 2;
  const top = center - downStack(groups) / 2;
  placeDown(groups, top);
  placeDown([model.strayDown], top + downStack(groups) + metrics.sets);
  return rows;
}

class UpStack {
  readonly #heightOf: (entry: Entry) => number;
  readonly #metrics: AroundMetrics;
  readonly #heights = new Map<UpNode, number>();

  constructor(heightOf: (entry: Entry) => number, metrics: AroundMetrics) {
    this.#heightOf = heightOf;
    this.#metrics = metrics;
  }

  #node(node: UpNode): number {
    let height = this.#heights.get(node);
    if (height === undefined) {
      const own = this.#heightOf(node.entry) + this.#metrics.rows;
      this.#heights.set(node, (height = Math.max(own, this.height(node.above))));
    }
    return height;
  }

  #before({ isFirst }: UpNode, i: number): number {
    return i > 0 && isFirst ? this.#metrics.sets : 0;
  }

  height(nodes: UpNode[]): number {
    return nodes.reduce((sum, node, i) => sum + this.#before(node, i) + this.#node(node), 0);
  }

  place(nodes: UpNode[], middle: number, rows: Rows): void {
    let y = middle - this.height(nodes) / 2;
    nodes.forEach((node, i) => {
      y += this.#before(node, i);
      const height = this.#node(node);
      const h = this.#heightOf(node.entry);
      rows.set(node.entry.key, { y: y + (height - h) / 2, h });
      this.place(node.above, y + height / 2, rows);
      y += height;
    });
  }
}

/** The person first, then the nearest kin, then the further ones. */
function readingOrder({ entries }: Model): string[] {
  const rank: Record<Role, number> = {
    focus: 0,
    partner: 1,
    sibling: 2,
    ancestor: 3,
    unknown: 3,
    reference: 3,
    descendant: 4,
  };
  const far = ({ generation, role, isSpouse }: Entry): number =>
    (isSpouse && generation === 0 ? 1 : generation > 0 ? 4 : rank[role]) * 1000 +
    Math.abs(generation);
  return [...entries.values()].sort((a, b) => far(a) - far(b)).map(({ key }) => key);
}
