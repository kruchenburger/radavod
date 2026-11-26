import type { Box } from "./types";

/** How far a point is from a box, 0 inside it. */
export function distanceTo({ x, y, w, h }: Box, px: number, py: number): number {
  return Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h));
}
