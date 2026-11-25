import type { Box, Card, Point } from "./types";

type Place = { cards: Card[] };

/**
 * The same place on another level of the map: the same spot of the nearest card. A place is kept as
 * it is when the other level has no card of it.
 */
export function carry(point: Point, from: Place, to: Place): Point {
  const [x, y] = point;
  let nearest: Card | undefined;
  let distance = Infinity;
  for (const card of from.cards) {
    const far = distanceTo(card, x, y);
    if (far < distance) [nearest, distance] = [card, far];
  }
  const there = to.cards.find(({ key }) => key === nearest?.key);
  if (nearest === undefined || there === undefined) return point;
  return [
    there.x + there.w / 2 + ((x - nearest.x - nearest.w / 2) * there.w) / nearest.w,
    there.y + there.h / 2 + ((y - nearest.y - nearest.h / 2) * there.h) / nearest.h,
  ];
}

export function distanceTo({ x, y, w, h }: Box, px: number, py: number): number {
  return Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h));
}
