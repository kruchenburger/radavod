import type { TreeSnapshot } from "../../../src/shared/tree";
import { type BranchMap, branchMap, type MapLevel, type MapOptions } from "./branch-map";

/** A map asked for as a message: no functions, so it can go to a worker. */
export type MapRequest = {
  snapshot: TreeSnapshot;
  levels: MapLevel[];
  /** Widths of the heads of pages by branch. Only the page has the fonts. */
  headWidths: [branch: string, width: number][];
} & Pick<MapOptions, "lineOf" | "perRow" | "width">;

/** One map for every level, with the same pages in a row on all of them. */
export function answer({ snapshot, levels, headWidths, ...options }: MapRequest): BranchMap[] {
  const widths = new Map(headWidths);
  const maps: BranchMap[] = [];
  for (const level of levels) {
    const perRow = maps[0]?.perRow ?? options.perRow;
    maps.push(
      branchMap(snapshot, {
        ...options,
        ...(perRow === undefined ? {} : { perRow }),
        level,
        headOf: ({ id }) => id,
        measure: (id) => widths.get(id) ?? 0,
      }),
    );
  }
  return maps;
}
