import { parseSamplePath, samplePath } from "../../src/shared/sample-path";
import type { MapLevel } from "../tree/layout/branch-map";

export type Half = "ancestors" | "descendants";

/** A place on the map that is the same in every language and on every screen. */
export type Spot = { person: string; dx: number; dy: number };

export type TreePlace = {
  screen: "tree";
  /** Null for the one the example begins with. */
  person: string | null;
  siblings: boolean;
  /** The partner whose family is open, when there are three and more. */
  open: string | null;
  half: Half;
};

export type BranchesPlace = {
  screen: "branches";
  level: MapLevel;
  /** The chosen person. */
  person: string | null;
  /** The branch to come closer to. */
  branch: string | null;
  /** What stands in the middle. */
  at: Spot | null;
  /** How much larger than the level is, 1 by default. */
  scale: number;
};

export type Place =
  | TreePlace
  | BranchesPlace
  | { screen: "person"; person: string }
  | { screen: "list"; person: string };

export const treePlace = (person: string | null): TreePlace => ({
  screen: "tree",
  person,
  siblings: false,
  open: null,
  half: "ancestors",
});

export const branchesPlace = (place: Partial<BranchesPlace> = {}): BranchesPlace => ({
  screen: "branches",
  level: "far",
  person: null,
  branch: null,
  at: null,
  scale: 1,
  ...place,
});

const id = /^[\w-]{1,64}$/;
const spot = /^([\w-]{1,64})\.(-?\d{1,6})\.(-?\d{1,6})$/;

/** What an address means. Anything it does not understand in the query is left out. */
export function readPlace(path: string, search: string): Place | null {
  const found = parseSamplePath(path);
  if (found === null) return null;
  const query = new URLSearchParams(search);
  const idOf = (name: string): string | null => {
    const value = query.get(name);
    return value !== null && id.test(value) ? value : null;
  };
  if (found.screen === "tree") {
    return {
      ...treePlace(found.person),
      siblings: query.get("siblings") === "open",
      open: idOf("union"),
      half: query.get("half") === "descendants" ? "descendants" : "ancestors",
    };
  }
  if (found.screen !== "branches") return found;
  const level = query.get("level");
  const [, person, dx, dy] = spot.exec(query.get("at") ?? "") ?? [];
  const scale = Number(query.get("scale") ?? 1);
  return branchesPlace({
    level: level === "closer" || level === "near" ? level : "far",
    person: idOf("person"),
    branch: idOf("branch"),
    at: person === undefined ? null : { person, dx: Number(dx), dy: Number(dy) },
    scale: scale > 0 && scale <= 100 ? scale : 1,
  });
}

export function hrefOf(place: Place): string {
  const query = new URLSearchParams();
  if (place.screen === "tree") {
    if (place.siblings) query.set("siblings", "open");
    if (place.open !== null) query.set("union", place.open);
    if (place.half === "descendants") query.set("half", place.half);
  }
  if (place.screen === "branches") {
    if (place.level !== "far") query.set("level", place.level);
    if (place.person !== null) query.set("person", place.person);
    if (place.branch !== null) query.set("branch", place.branch);
    if (place.at !== null) {
      const { person, dx, dy } = place.at;
      query.set("at", `${person}.${Math.round(dx)}.${Math.round(dy)}`);
    }
    if (place.scale !== 1) query.set("scale", String(Math.round(place.scale * 100) / 100));
  }
  const search = query.toString();
  return samplePath(place) + (search === "" ? "" : `?${search}`);
}
