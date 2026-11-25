import type { BranchMap } from "./branch-map";

/**
 * How much of the order two drawings share: of the neighbors that stood in one row, how many still
 * stand in one row and in the same order. A move as a whole costs nothing.
 */
export function stability(
  before: string[][],
  after: string[][],
  except: ReadonlySet<string> = new Set(),
): { pairs: number; kept: number; share: number } {
  const places = new Map<string, { track: number; at: number }>();
  after.forEach((keys, track) => {
    keys.forEach((key, at) => places.set(key, { track, at }));
  });
  let pairs = 0;
  let kept = 0;
  for (const keys of before) {
    const rest = keys.filter((key) => places.has(key) && !except.has(key));
    rest.slice(1).forEach((key, i) => {
      const first = places.get(rest[i] as string);
      const second = places.get(key);
      pairs += 1;
      if (first?.track === second?.track && (first?.at ?? 0) < (second?.at ?? 0)) kept += 1;
    });
  }
  return { pairs, kept, share: pairs === 0 ? 1 : kept / pairs };
}

/** The people of every row of every page, from left to right. */
export function mapTracks({ cards, pages }: BranchMap): string[][] {
  const tracks = new Map<string, BranchMap["cards"]>();
  for (const card of cards) {
    if (card.person === null) continue;
    const name = `${pages[card.page]?.branch} ${card.row}`;
    const track = tracks.get(name);
    if (track === undefined) tracks.set(name, [card]);
    else track.push(card);
  }
  return [...tracks.values()].map((track) =>
    track.sort((a, b) => a.x - b.x || a.y - b.y).map(({ person }) => person as string),
  );
}
