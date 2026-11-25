export type Point = { x: number; y: number };

/** The SVG path of a curly brace: two ends on one vertical, the tip to the right of them. */
export function brace(top: Point, bottom: Point, tip: Point): string {
  const spine = (top.x + tip.x) / 2;
  const curve = Math.min(11, (tip.y - top.y) / 2, (bottom.y - tip.y) / 2);
  return [
    `M${top.x} ${top.y}Q${spine} ${top.y} ${spine} ${top.y + curve}`,
    `V${tip.y - curve}Q${spine} ${tip.y} ${tip.x} ${tip.y}`,
    `Q${spine} ${tip.y} ${spine} ${tip.y + curve}`,
    `V${bottom.y - curve}Q${spine} ${bottom.y} ${bottom.x} ${bottom.y}`,
  ].join("");
}
