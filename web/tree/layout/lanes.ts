/** Lanes are this far apart. Places on one side of a track keep to a grid of the same step. */
export const step = 8;

/** Families in one lane keep this far from each other. */
const clearance = 10;

/**
 * A strip without cards where lines turn: between columns, between rows, between pages. Every
 * family gets one lane of it, and families whose stretches meet get different lanes.
 */
export class Track {
  readonly #spans = new Map<string, { from: number; to: number; lane: number }>();

  /** The family has a line here that enters or leaves the strip at this place. */
  touch(family: string, at: number): void {
    const span = this.#spans.get(family);
    if (span === undefined) {
      this.#spans.set(family, { from: at, to: at, lane: 0 });
    } else {
      span.from = Math.min(span.from, at);
      span.to = Math.max(span.to, at);
    }
  }

  /** Deals out the lanes and tells how many there are. */
  lay(): number {
    const ends: number[] = [];
    const spans = [...this.#spans.values()].filter(({ from, to }) => to > from);
    // The sort is stable, so equal spans keep the order in which they came.
    spans.sort((a, b) => (a.from === b.from ? 0 : a.from - b.from));
    for (const span of spans) {
      let lane = 0;
      while (lane < ends.length && (ends[lane] as number) + clearance > span.from) lane += 1;
      ends[lane] = span.to;
      span.lane = lane;
    }
    return ends.length;
  }

  lane(family: string): number {
    return this.#spans.get(family)?.lane ?? 0;
  }
}

/** The nearest place of the grid for lines that leave a card. */
export const outPlace = (at: number): number => Math.round(at / step) * step;

/** The nearest place for lines that come in: half a step off, so they never meet the others. */
export const inPlace = (at: number): number => outPlace(at - step / 2) + step / 2;

/** Places for several families on one side of a card, around its middle. */
export function spread(middle: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => middle + (i - Math.floor((count - 1) / 2)) * step);
}
