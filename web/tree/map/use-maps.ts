import { useEffect, useMemo, useState } from "react";
import type { TreeSnapshot } from "../../../src/shared/tree";
import { useLanguage } from "../../app/language";
import type { MapLevel } from "../layout/branch-map";
import type { MapRequest } from "../layout/map-request";
import { MapLayouter } from "../map-layouter";
import { measure } from "../type";
import { wordsOf } from "../words";
import type { Maps } from "./view";

export type MapsState =
  { status: "loading" } | { status: "failed" } | { status: "ready"; of: Maps; isOld: boolean };

const levels: MapLevel[] = ["far", "closer", "near"];

let layouter: MapLayouter | null = null;
const made = new WeakMap<TreeSnapshot, Map<string, Promise<Maps>>>();

/** Laid out once for a language and a shape, away from the main thread. A failure is not kept. */
function mapsOf(snapshot: TreeSnapshot, name: string, request: () => MapRequest): Promise<Maps> {
  let known = made.get(snapshot);
  if (known === undefined) made.set(snapshot, (known = new Map()));
  let maps = known.get(name);
  if (maps === undefined) {
    layouter ??= new MapLayouter();
    maps = layouter
      .layOut(request())
      .then(([far, closer, near]) => ({ far, closer, near }) as Maps);
    maps.catch(() => known.delete(name));
    known.set(name, maps);
  }
  return maps;
}

/** The map on all levels. While a new one is laid out the old one stays. */
export function useMaps(
  snapshot: TreeSnapshot,
  lineOf: string,
  perRow: number | null = null,
): MapsState {
  const { locale } = useLanguage();
  const name = [locale, lineOf, perRow].join(" ");
  const [state, setState] = useState<{ name: string; maps: Maps | null } | null>(null);
  const request = useMemo(
    () => (): MapRequest => {
      const words = wordsOf(snapshot, locale);
      const people = new Map<string, number>();
      for (const { branch } of snapshot.people) {
        if (branch !== null) people.set(branch, (people.get(branch) ?? 0) + 1);
      }
      // With fewer pages in a row the map is smaller, and the names of the pages are not.
      const room = perRow === null ? 1.3 : perRow < 4 ? 1.9 : 1.6;
      return {
        snapshot,
        levels,
        lineOf,
        headWidths: snapshot.branches.map(({ id }): [string, number] => [
          id,
          room *
            (measure(`${words.page(id)} `, "head") +
              measure(String(people.get(id) ?? 0), "detail")),
        ]),
        ...(perRow === null ? {} : { perRow, farHead: perRow < 4 ? 78 : 57 }),
      };
    },
    [snapshot, locale, lineOf, perRow],
  );
  useEffect(() => {
    let isGone = false;
    const put = (maps: Maps | null): void => {
      if (!isGone) setState({ name, maps });
    };
    mapsOf(snapshot, name, request).then(put, () => put(null));
    return () => {
      isGone = true;
    };
  }, [snapshot, name, request]);

  return useMemo(() => {
    if (state === null) return { status: "loading" };
    if (state.maps !== null) return { status: "ready", of: state.maps, isOld: state.name !== name };
    return state.name === name ? { status: "failed" } : { status: "loading" };
  }, [state, name]);
}
