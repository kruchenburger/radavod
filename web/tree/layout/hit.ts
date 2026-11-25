import { distanceTo } from "./carry";
import type { Box } from "./types";

const cell = 256;

/** Finds cards by place: what is under a finger, and what a window shows. */
export function cardIndex<T extends Box>(cards: T[]) {
  const cells = new Map<string, T[]>();
  const cellsOf = ({ x, y, w, h }: Box): string[] => {
    const names: string[] = [];
    for (let i = Math.floor(x / cell); i <= Math.floor((x + w) / cell); i += 1) {
      for (let j = Math.floor(y / cell); j <= Math.floor((y + h) / cell); j += 1) {
        names.push(`${i} ${j}`);
      }
    }
    return names;
  };
  for (const card of cards) {
    for (const name of cellsOf(card)) {
      const list = cells.get(name);
      if (list === undefined) cells.set(name, [card]);
      else list.push(card);
    }
  }
  const within = (box: Box): T[] => {
    const found = new Set(cellsOf(box).flatMap((name) => cells.get(name) ?? []));
    return [...found].filter(
      ({ x, y, w, h }) => x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y,
    );
  };
  return {
    within,
    /** The card at a point, or the nearest one within reach. */
    at: (x: number, y: number, reach = 0): T | null => {
      const near = Math.max(reach, 0.01);
      let best: T | null = null;
      let distance = Infinity;
      for (const card of within({ x: x - near, y: y - near, w: 2 * near, h: 2 * near })) {
        const far = distanceTo(card, x, y);
        if (far <= near && far < distance) [best, distance] = [card, far];
      }
      return best;
    },
  };
}
