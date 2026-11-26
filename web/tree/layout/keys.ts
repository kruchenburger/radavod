import type { AroundLayout } from "./around";
import type { GenerationsLayout } from "./generations";
import { listOf } from "./kin";
import type { Card, Link } from "./types";

export type Arrow = "up" | "down" | "left" | "right";

/** The card an arrow leads to from another one; `cameFrom` is the card visited before. */
export type Move = (key: string, arrow: Arrow, cameFrom: string | null) => string | null;

/** Left to a parent, right to a child, up and down the column and on into the next one. */
export function aroundKeys({ cards, links }: AroundLayout): Move {
  const kin = kinMoves(cards, links);
  const walk = [...cards].sort((a, b) => a.generation - b.generation || a.y - b.y);
  const along = neighbors(walk.map(({ key }) => key));
  return (key, arrow, cameFrom) => {
    if (arrow === "left") return kin.parent(key);
    if (arrow === "right") return kin.child(key, cameFrom);
    return along(key, arrow === "up" ? -1 : 1);
  };
}

/**
 * Up to a parent, down to a child, left and right along a row. Of several parents or children the
 * one on the direct line comes first, then the nearest; down leads back where up came from.
 */
export function generationsKeys({ cards, links, rows }: GenerationsLayout): Move {
  const kin = kinMoves(cards, links);
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const centreOf = (key: string): number => {
    const card = byKey.get(key);
    return card === undefined ? 0 : card.x + card.w / 2;
  };
  const nearest = (from: string, keys: string[]): string | null =>
    [...keys].sort(
      (a, b) => Math.abs(centreOf(a) - centreOf(from)) - Math.abs(centreOf(b) - centreOf(from)),
    )[0] ?? null;
  const along = rows.map(neighbors);
  const rowOf = new Map(rows.flatMap((row, i) => row.map((key) => [key, i] as const)));
  return (key, arrow, cameFrom) => {
    if (arrow === "up") return kin.parent(key, nearest);
    if (arrow === "down") return kin.child(key, cameFrom, nearest);
    return along[rowOf.get(key) ?? -1]?.(key, arrow === "left" ? -1 : 1) ?? null;
  };
}

/** Up and down a list. */
export function listKeys(order: string[]): (key: string, arrow: Arrow) => string | null {
  const along = neighbors(order);
  return (key, arrow) => {
    if (arrow === "up") return along(key, -1);
    return arrow === "down" ? along(key, 1) : null;
  };
}

function kinMoves(
  cards: Card[],
  links: Link[],
  isNear: (a: string, b: string) => boolean = () => true,
) {
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const link of links) {
    if (link.type !== "parentage" || !byKey.has(link.child)) continue;
    for (const parent of link.parents) {
      if (!byKey.has(parent)) continue;
      listOf(parents, link.child).push(parent);
      listOf(children, parent).push(link.child);
    }
  }
  type Pick = (from: string, keys: string[]) => string | null;
  const first: Pick = (from, keys) => keys.find((key) => isNear(from, key)) ?? keys[0] ?? null;
  const best = (from: string, keys: string[] = [], pick: Pick = first): string | null =>
    keys.find((key) => byKey.get(key)?.direct === true) ?? pick(from, keys);
  return {
    parent: (key: string, pick?: Pick): string | null => best(key, parents.get(key), pick),
    child: (key: string, cameFrom: string | null, pick?: Pick): string | null => {
      const own = children.get(key);
      return cameFrom !== null && own?.includes(cameFrom) === true
        ? cameFrom
        : best(key, own, pick);
    },
  };
}

function neighbors(order: string[]): (key: string, by: 1 | -1) => string | null {
  const places = new Map(order.map((key, at) => [key, at]));
  return (key, by) => {
    const at = places.get(key);
    return at === undefined ? null : (order[at + by] ?? null);
  };
}
