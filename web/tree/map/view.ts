import type { BranchMap, MapLevel } from "../layout/branch-map";
import { carry, distanceTo } from "../layout/carry";
import { personKey } from "../layout/types";

export type Maps = Record<MapLevel, BranchMap>;
export type Size = { w: number; h: number };

/** What the window shows: a point of the map in the middle of it, and how large the map is. */
export type View = { level: MapLevel; x: number; y: number; k: number };

/** The middle of the window told by the nearest person, the same on every screen. */
export type Spot = { person: string; dx: number; dy: number };

/** The scales at which a level may rest: names are never smaller than they are meant to be. */
const rest: Record<MapLevel, { least: number; most: number }> = {
  far: { least: 0, most: 2 },
  closer: { least: 1, most: 1.3 },
  near: { least: 1, most: 2 },
};

/** Around the map. */
const margin = 16;
const largest = 1.5;

/** Under the fingers levels change where a person is this wide, so that a name is never a bar. */
const changes = { farToCloser: 92, closerToFar: 84, closerToNear: 180, nearToCloser: 170 };

/** The whole map on a wide window; on a narrow one as wide as the window, and on downwards. */
export function fit({ width, height }: BranchMap, window: Size, isNarrow: boolean): View {
  const across = (window.w - 2 * margin * (isNarrow ? 0.5 : 1)) / Math.max(1, width);
  const down = (window.h - 2 * margin) / Math.max(1, height);
  const k = Math.min(isNarrow ? across : Math.min(across, down), largest);
  const isWhole = height * k <= window.h;
  const y = isWhole ? height / 2 : window.h / 2 / k - margin / 2 / k;
  return { level: "far", x: width / 2, y, k };
}

/** The same view, with the map not further away than it has to be. */
export function hold(view: View, map: BranchMap, window: Size): View {
  const along = (at: number, length: number, room: number): number => {
    const half = room / 2 / view.k;
    const edge = margin / view.k;
    if (length + 2 * edge <= 2 * half) return length / 2;
    return Math.min(Math.max(at, half - edge), length + edge - half);
  };
  return { ...view, x: along(view.x, map.width, window.w), y: along(view.y, map.height, window.h) };
}

export const pan = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x - dx / view.k,
  y: view.y - dy / view.k,
});

/** The point of the map under a point of the window, both counted from their corners. */
export const pointAt = (view: View, window: Size, px: number, py: number): [number, number] => [
  view.x + (px - window.w / 2) / view.k,
  view.y + (py - window.h / 2) / view.k,
];

/** Puts a point of the map under a point of the window. */
const put = (
  [x, y]: readonly [number, number],
  view: View,
  window: Size,
  px: number,
  py: number,
): View => ({
  ...view,
  x: x - (px - window.w / 2) / view.k,
  y: y - (py - window.h / 2) / view.k,
});

type About = { maps: Maps; window: Size; px: number; py: number };

/** Another level at another scale: what is under the point stays under it. */
export function toLevel(view: View, level: MapLevel, k: number, about: About): View {
  const { maps, window, px, py } = about;
  const here = pointAt(view, window, px, py);
  const there = level === view.level ? here : carry(here, maps[view.level], maps[level]);
  return put(there, { ...view, level, k }, window, px, py);
}

/** Closer or further by a factor, under the fingers: levels change on the way. */
export function zoom(view: View, factor: number, about: About): View {
  const { maps, window } = about;
  const widthOf = (level: MapLevel): number => maps[level].metrics.w;
  const least = fit(maps.far, window, isNarrow(window)).k * widthOf("far");
  const wanted = view.k * factor * widthOf(view.level);
  const person = Math.min(Math.max(wanted, least), rest.near.most * widthOf("near"));
  let { level } = view;
  if (level === "far" && person > changes.farToCloser) level = "closer";
  if (level === "closer" && person > changes.closerToNear) level = "near";
  if (level === "near" && person < changes.nearToCloser) level = "closer";
  if (level === "closer" && person < changes.closerToFar) level = "far";
  return toLevel(view, level, person / widthOf(level), about);
}

/**
 * Where a zoom comes to rest. A scale at which nothing can be read goes on in the direction it came
 * from, so that a single notch of a wheel leads somewhere.
 */
export function settle(view: View, direction: "in" | "out", about: About): View {
  const { least, most } = rest[view.level];
  if (view.k >= least && view.k <= most) return view;
  if (view.level === "closer" && view.k < least && direction === "out") {
    return toLevel(view, "far", rest.far.most, about);
  }
  if (view.level === "far" && direction === "in") return toLevel(view, "closer", 1, about);
  return toLevel(view, view.level, Math.min(Math.max(view.k, least), most), about);
}

export const isNarrow = ({ w }: Size): boolean => w < 720;

export function spotOf(view: View, { cards }: BranchMap): Spot | null {
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

/** Null for somebody who is not on the map. */
export function viewOfSpot(spot: Spot, level: MapLevel, k: number, map: BranchMap): View | null {
  const card = cardOf(map, spot.person);
  return card === undefined ? null : { level, x: card.x + spot.dx, y: card.y + spot.dy, k };
}

export function viewOfPerson(person: string, level: MapLevel, map: BranchMap): View | null {
  const card = cardOf(map, person);
  if (card === undefined) return null;
  return { level, x: card.x + card.w / 2, y: card.y + card.h / 2, k: 1 };
}

/** A page in the middle; the beginning of one that is larger than the window. */
export function viewOfPage(
  page: number,
  level: MapLevel,
  map: BranchMap,
  window: Size,
): View | null {
  const own = map.pages[page];
  if (own === undefined) return null;
  const [first] = map.cards.filter((card) => card.page === page);
  const isWide = own.w > window.w;
  const isHigh = own.h > window.h;
  return {
    level,
    x: isWide && first !== undefined ? first.x + first.w / 2 : own.x + own.w / 2,
    y: isHigh ? own.y + window.h / 2 - margin : own.y + own.h / 2,
    k: 1,
  };
}

const cardOf = (map: BranchMap, person: string) =>
  map.cards.find(({ key }) => key === personKey(person));

/** The least movement that brings a box into the window. */
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

/** A step on the way from one view to another on the same level: `at` from 0 to 1. */
export function between(from: View, to: View, at: number): View {
  // Scales grow by factors, and the middle follows the scale.
  const k = from.k * (to.k / from.k) ** at;
  const share = from.k === to.k ? at : (1 / from.k - 1 / k) / (1 / from.k - 1 / to.k);
  return {
    level: to.level,
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    k,
  };
}
