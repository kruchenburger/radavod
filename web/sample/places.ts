import { parseSamplePath, samplePath } from "../../src/shared/sample-path";

export type Half = "ancestors" | "descendants";

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
  /** The pages by branch, which open as the list of the person, or the fan of ancestors. */
  as: "list" | "fan";
  /** The chosen person. */
  person: string | null;
  /** The page to open the pages by branch on. */
  branch: string | null;
  /** On the fan, the partner who stands in the centre with the chosen person. */
  partner: string | null;
};

export type Place =
  | TreePlace
  | BranchesPlace
  /** The tree by generations. Null for the one the example begins with. */
  | { screen: "generations"; person: string | null }
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
  as: "list",
  person: null,
  branch: null,
  partner: null,
  ...place,
});

const id = /^[\w-]{1,64}$/;

/**
 * What an address means. Anything it does not understand in the query is left out: an address of
 * the old map or canvas, with its level or place, opens the pages by branch on the same person.
 */
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
  return branchesPlace({
    as: query.get("as") === "fan" ? "fan" : "list",
    partner: idOf("with"),
    person: idOf("person"),
    branch: idOf("branch"),
  });
}

export function hrefOf(place: Place): string {
  const query = new URLSearchParams();
  if (place.screen === "tree") {
    if (place.siblings) query.set("siblings", "open");
    if (place.open !== null) query.set("union", place.open);
    if (place.half === "descendants") query.set("half", place.half);
  }
  if (place.screen === "branches" && place.as === "fan") {
    query.set("as", "fan");
    if (place.person !== null) query.set("person", place.person);
    if (place.partner !== null) query.set("with", place.partner);
  } else if (place.screen === "branches") {
    if (place.person !== null) query.set("person", place.person);
    if (place.branch !== null) query.set("branch", place.branch);
  }
  const search = query.toString();
  return samplePath(place) + (search === "" ? "" : `?${search}`);
}
