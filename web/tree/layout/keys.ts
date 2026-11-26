import type { AroundLayout } from "./around";
import type { BranchMap } from "./branch-map";
import { listOf } from "./kin";
import type { Card, Link } from "./types";

export type Arrow = "up" | "down" | "left" | "right";

/** The card an arrow leads to from another one; `cameFrom` is the card visited before. */
export type Move = (key: string, arrow: Arrow, cameFrom: string | null) => string | null;

/**
 * Up to a parent, down to a child, left and right along the row of the page. At the end of a row
 * the walk goes on in the next one, and then on the next page, so left and right alone come to
 * everybody, wherever kinship leads.
 */
export function mapKeys({ cards, links }: BranchMap): Move {
  const pages = new Map(cards.map(({ key, page }) => [key, page]));
  const kin = kinMoves(cards, links, (a, b) => pages.get(a) === pages.get(b));
  const walk = cards
    .filter(({ person }) => person !== null)
    .sort((a, b) => a.page - b.page || a.row - b.row || a.x - b.x || a.y - b.y);
  const along = neighbors(walk.map(({ key }) => key));
  return (key, arrow, cameFrom) => {
    if (arrow === "up") return kin.parent(key);
    if (arrow === "down") return kin.child(key, cameFrom);
    return along(key, arrow === "left" ? -1 : 1);
  };
}

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
  const best = (from: string, keys: string[] = []): string | null =>
    keys.find((key) => byKey.get(key)?.direct === true) ??
    keys.find((key) => isNear(from, key)) ??
    keys[0] ??
    null;
  return {
    parent: (key: string): string | null => best(key, parents.get(key)),
    child: (key: string, cameFrom: string | null): string | null => {
      const own = children.get(key);
      return cameFrom !== null && own?.includes(cameFrom) === true ? cameFrom : best(key, own);
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
