import type { MapMetrics } from "./branch-map";
import type { MapModel, MapNode } from "./map-model";

/** Where nodes stand on their pages, before anything is known about lines and other pages. */
export type Placed = {
  /** From the left edge of the contents of the page. */
  x: (node: MapNode) => number;
  /** The row of the page; rows without anybody are left out. */
  rowOf: (node: MapNode) => number;
  /** Room for lines beside a node. */
  room: (node: MapNode) => { left: number; right: number };
  pages: { width: number; rowHeights: number[] }[];
};

/** The outline of a tree: how far it reaches in every row, the deepest row first. */
type Outline = { left: number[]; right: number[]; shift: number };

/**
 * A tidy tree: a parent stands over the middle of the children, and trees slide together until
 * their outlines meet.
 */
export function placeNodes(model: MapModel, metrics: MapMetrics): Placed {
  const { step, w, tick } = metrics;
  const entering = lanesInto(model);
  const room = (node: MapNode): { left: number; right: number } => ({
    left: tick + step * Math.max(1, entering.get(node)?.size ?? 0),
    right: step * node.exits.length,
  });

  // Children come after their parents in the list, so from its end every subtree is ready.
  const outlines = new Map<MapNode, Outline>();
  const offsets = new Map<MapNode, number>();
  for (let i = model.nodes.length - 1; i >= 0; i -= 1) {
    const node = model.nodes[i] as MapNode;
    let outline: Outline = { left: [], right: [], shift: 0 };
    node.children.forEach((child, n) => {
      const own = outlines.get(child) as Outline;
      outlines.delete(child);
      const offset = n === 0 ? 0 : distance(outline, own);
      offsets.set(child, offset);
      own.shift += offset;
      outline = n === 0 ? own : merge(outline, own);
    });
    const first = offsets.get(node.children[0] as MapNode) ?? 0;
    const last = offsets.get(node.children.at(-1) as MapNode) ?? 0;
    const middle = Math.round((first + last) / 2 / step) * step;
    for (const child of node.children) offsets.set(child, (offsets.get(child) ?? 0) - middle);
    outline.shift -= middle;
    const { left, right } = room(node);
    outline.left.push(-left - outline.shift);
    outline.right.push(w + right - outline.shift);
    outlines.set(node, outline);
  }

  const xs = new Map<MapNode, number>();
  const rights: Map<number, number>[] = model.pages.map(() => new Map());
  for (const node of model.nodes) {
    if (node.parent !== null) {
      xs.set(node, (xs.get(node.parent) ?? 0) + (offsets.get(node) ?? 0));
      continue;
    }
    const outline = outlines.get(node) as Outline;
    const taken = rights[node.page] as Map<number, number>;
    const depth = outline.left.length;
    const leftIn = (d: number): number => (outline.left[depth - 1 - d] as number) + outline.shift;
    const rightIn = (d: number): number => (outline.right[depth - 1 - d] as number) + outline.shift;
    let x = -Infinity;
    for (let d = 0; d < depth; d += 1) {
      const right = taken.get(node.generation + d);
      if (right !== undefined) x = Math.max(x, right + step - leftIn(d));
    }
    // Not right under somebody who is no parent.
    const above = taken.get(node.generation - 1);
    if (above !== undefined) x = Math.max(x, above + step - leftIn(0));
    if (x === -Infinity) {
      x = taken.size === 0 ? 0 : Math.max(...taken.values()) + step - leftIn(0);
    }
    x = Math.ceil(x / step) * step;
    xs.set(node, x);
    for (let d = 0; d < depth; d += 1) {
      const row = node.generation + d;
      taken.set(row, Math.max(taken.get(row) ?? -Infinity, x + rightIn(d)));
    }
  }

  const bounds = model.pages.map(() => ({ left: Infinity, right: -Infinity }));
  const heights: Map<number, number>[] = model.pages.map(() => new Map());
  for (const node of model.nodes) {
    const bound = bounds[node.page] as { left: number; right: number };
    const x = xs.get(node) ?? 0;
    bound.left = Math.min(bound.left, x - room(node).left);
    bound.right = Math.max(bound.right, x + w + room(node).right);
    const page = heights[node.page] as Map<number, number>;
    const height = node.rows.length * metrics.line;
    page.set(node.generation, Math.max(page.get(node.generation) ?? 0, height));
  }
  const rows = heights.map((page) => [...page.keys()].sort((a, b) => a - b));
  const indexes = rows.map((page) => new Map(page.map((generation, i) => [generation, i])));
  return {
    room,
    x: (node) => (xs.get(node) ?? 0) - (bounds[node.page]?.left ?? 0),
    rowOf: (node) => indexes[node.page]?.get(node.generation) ?? 0,
    pages: model.pages.map((_, i) => {
      const { left, right } = bounds[i] as { left: number; right: number };
      return {
        width: Math.max(0, right - left),
        rowHeights: (rows[i] ?? []).map((generation) => heights[i]?.get(generation) ?? 0),
      };
    }),
  };

  /** How far right the second tree has to go to clear the first. */
  function distance(a: Outline, b: Outline): number {
    let far = -Infinity;
    for (let d = 1; d <= Math.min(a.left.length, b.left.length); d += 1) {
      const right = (a.right.at(-d) as number) + a.shift;
      const left = (b.left.at(-d) as number) + b.shift;
      far = Math.max(far, right + step - left);
    }
    return far;
  }
}

/** The outline of two trees side by side, made out of the deeper one. */
function merge(a: Outline, b: Outline): Outline {
  const depth = Math.min(a.left.length, b.left.length);
  const isFirst = a.left.length >= b.left.length;
  const [base, other] = isFirst ? [a, b] : [b, a];
  const side = isFirst ? "right" : "left";
  for (let d = 1; d <= depth; d += 1) {
    const value = (other[side].at(-d) as number) + other.shift;
    base[side][base[side].length - d] = value - base.shift;
  }
  return base;
}

/** Families of the direct line that come to a node from its left, or leave a couple there. */
export function lanesInto(model: MapModel): Map<MapNode, Set<string>> {
  const nodeOf = new Map(
    model.nodes.flatMap((node) => node.rows.map(({ key }) => [key, node] as const)),
  );
  const lanes = new Map<MapNode, Set<string>>();
  const add = (node: MapNode | undefined, family: string): void => {
    if (node === undefined) return;
    const families = lanes.get(node);
    if (families === undefined) lanes.set(node, new Set([family]));
    else families.add(family);
  };
  for (const { reference, to, family } of model.crossings) {
    add(nodeOf.get(to), family);
    const start = nodeOf.get(reference);
    if (start?.isList === false) add(start, family);
  }
  return lanes;
}
