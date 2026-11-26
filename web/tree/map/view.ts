import type { BranchMap } from "../layout/branch-map";
import { distanceTo } from "../layout/carry";
import { personKey } from "../layout/types";

export type Size = { w: number; h: number };

/** What the window shows: a point of the canvas in the middle of it, and how large it is. */
export type View = { x: number; y: number; k: number };

/** The middle of the window told by the nearest person, the same on every screen. */
export type Spot = { person: string; dx: number; dy: number };

/** Names of 19 px are never smaller than 14 px, and never larger than half as much again. */
export const scales = { least: 14 / 19, most: 1.5 };

/** Around the canvas. */
const margin = 16;

export const isNarrow = ({ w }: Size): boolean => w < 720;

/** A scale the canvas may stand at, whatever an address or a pinch asks for. */
export const restingScale = (k: number): number => Math.min(Math.max(k, scales.least), scales.most);

/** The same view, with the canvas not further away than it has to be. */
export function hold(view: View, map: Pick<BranchMap, "width" | "height">, window: Size): View {
  const along = (at: number, length: number, room: number): number => {
    const half = room / 2 / view.k;
    const edge = margin / view.k;
    if (length + 2 * edge <= 2 * half) return length / 2;
    return Math.min(Math.max(at, half - edge), length + edge - half);
  };
  const k = restingScale(view.k);
  return { k, x: along(view.x, map.width, window.w), y: along(view.y, map.height, window.h) };
}

export const pan = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x - dx / view.k,
  y: view.y - dy / view.k,
});

/** The point of the canvas under a point of the window, both counted from their corners. */
export const pointAt = (view: View, window: Size, px: number, py: number): [number, number] => [
  view.x + (px - window.w / 2) / view.k,
  view.y + (py - window.h / 2) / view.k,
];

/** Larger or smaller by a factor, under the fingers: the point under them stays there. */
export function zoom(view: View, factor: number, window: Size, px: number, py: number): View {
  const k = restingScale(view.k * factor);
  const [x, y] = pointAt(view, window, px, py);
  return { k, x: x - (px - window.w / 2) / k, y: y - (py - window.h / 2) / k };
}

export function spotOf(view: View, { cards }: Pick<BranchMap, "cards">): Spot | null {
  let nearest: BranchMap["cards"][number] | null = null;
  let distance = Infinity;
  for (const card of cards) {
    if (card.person === null) continue;
    const far = distanceTo(card, view.x, view.y);
    if (far < distance) [nearest, distance] = [card, far];
  }
  if (nearest === null || nearest.person === null) return null;
  return {
    person: nearest.person,
    dx: Math.round(view.x - nearest.x),
    dy: Math.round(view.y - nearest.y),
  };
}

/** Null for somebody who is not on the canvas. */
export function viewOfSpot(spot: Spot, k: number, map: Pick<BranchMap, "cards">): View | null {
  const card = cardOf(map, spot.person);
  return card === undefined ? null : { x: card.x + spot.dx, y: card.y + spot.dy, k };
}

/** The person in the middle of the window, a little above it: the ancestors stand over them. */
export function viewOfPerson(
  person: string,
  map: Pick<BranchMap, "cards">,
  window: Size,
  k = 1,
): View | null {
  const card = cardOf(map, person);
  if (card === undefined) return null;
  return { x: card.x + card.w / 2, y: card.y + card.h / 2 - window.h / 8 / k, k };
}

/** The beginning of a page, its first generation in the middle of the window. */
export function viewOfPage(page: number, map: BranchMap, window: Size, k = 1): View | null {
  const own = map.pages[page];
  if (own === undefined) return null;
  const cards = map.cards.filter((card) => card.page === page && card.person !== null);
  const first = cards.reduce<(typeof cards)[number] | undefined>(
    (best, card) =>
      best === undefined || card.row < best.row || (card.row === best.row && card.x < best.x)
        ? card
        : best,
    undefined,
  );
  if (first === undefined) return { x: own.x + own.w / 2, y: window.h / 2 / k, k };
  return { x: first.x + first.w / 2, y: first.y + window.h / 4 / k, k };
}

const cardOf = (map: Pick<BranchMap, "cards">, person: string) =>
  map.cards.find(({ key }) => key === personKey(person));

/** The least movement that brings a box into the window, below the heads of the pages. */
export function reveal(
  view: View,
  box: { x: number; y: number; w: number; h: number },
  window: Size,
  head: number,
): View {
  const edge = 24 / view.k;
  const along = (
    at: number,
    from: number,
    length: number,
    room: number,
    before: number,
  ): number => {
    const half = room / 2 / view.k;
    const low = from + length + edge - half;
    const high = from - edge - before / view.k + half;
    return low > high ? from + length / 2 : Math.min(Math.max(at, low), high);
  };
  return {
    ...view,
    x: along(view.x, box.x, box.w, window.w, 0),
    y: along(view.y, box.y, box.h, window.h, head),
  };
}

/** A step on the way from one view to another: `at` from 0 to 1. */
export function between(from: View, to: View, at: number): View {
  // Scales grow by factors, and the middle follows the scale.
  const k = from.k * (to.k / from.k) ** at;
  const share = from.k === to.k ? at : (1 / from.k - 1 / k) / (1 / from.k - 1 / to.k);
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share, k };
}

/** The window on the strip of the whole: where it stands, as shares of the canvas. */
export function windowOnWhole(
  view: View,
  map: Pick<BranchMap, "width" | "height">,
  window: Size,
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const [left, top] = pointAt(view, window, 0, 0);
  const [right, bottom] = pointAt(view, window, window.w, window.h);
  const share = (value: number, length: number) =>
    Math.min(1, Math.max(0, value / Math.max(1, length)));
  const [x, y] = [share(left, map.width), share(top, map.height)];
  return { x, y, w: share(right, map.width) - x, h: share(bottom, map.height) - y };
}
