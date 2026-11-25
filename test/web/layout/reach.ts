import type { Move } from "../../../web/tree/layout/keys";

/** Cards nobody comes to by arrows alone, from some other card. */
export function unreachable(cards: { key: string; person: string | null }[], move: Move): string[] {
  const people = cards.filter(({ person }) => person !== null).map(({ key }) => key);
  return people.flatMap((start) => {
    const seen = new Set([start]);
    for (const key of seen) {
      for (const arrow of ["up", "down", "left", "right"] as const) {
        const next = move(key, arrow, null);
        if (next !== null) seen.add(next);
      }
    }
    return people.filter((key) => !seen.has(key)).map((key) => `${key} from ${start}`);
  });
}
