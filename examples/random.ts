export type Random = {
  /** A whole number between both ends, ends included. */
  int: (from: number, to: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  /** The key of an entry, chosen in proportion to its weight. */
  weighted: <K extends string>(weights: readonly (readonly [K, number])[]) => K;
};

/** mulberry32: whole-number arithmetic only, so every machine gets the same family. */
export function randomFrom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const int = (from: number, to: number): number => from + Math.floor(next() * (to - from + 1));
  return {
    int,
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error("nothing to pick from");
      return items[int(0, items.length - 1)] as (typeof items)[number];
    },
    weighted: (weights) => {
      let rest = next() * weights.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [key, weight] of weights) if ((rest -= weight) < 0) return key;
      throw new Error("no weights");
    },
  };
}
