import type { TreeSnapshot } from "../../../src/shared/tree";
import { type BranchMap, branchMap, type MapLevel, type MapOptions } from "./branch-map";

/** A map asked for as a message: no functions, so it can go to a worker. */
export type MapRequest = {
  snapshot: TreeSnapshot;
  levels: MapLevel[];
  /** Widths of the heads of pages by branch. Only the page has the fonts. */
  headWidths: [branch: string, width: number][];
} & Pick<MapOptions, "lineOf" | "perRow" | "width">;

/**
 * One map for every level. The first level decides how many pages stand in a row, within `width`
 * if there is one, and the others follow it.
 */
export function answer({
  snapshot,
  levels,
  headWidths,
  lineOf = null,
  ...first
}: MapRequest): BranchMap[] {
  const widths = new Map(headWidths);
  const maps: BranchMap[] = [];
  for (const level of levels) {
    const perRow = maps[0]?.perRow;
    maps.push(
      branchMap(snapshot, {
        ...(perRow === undefined ? first : { perRow }),
        lineOf,
        level,
        headOf: ({ id }) => id,
        measure: (id) => widths.get(id) ?? 0,
      }),
    );
  }
  return maps;
}
