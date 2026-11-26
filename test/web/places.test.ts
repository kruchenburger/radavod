import { expect, it } from "vitest";
import { parseSamplePath } from "../../src/shared/sample-path";
import { branchesPlace, hrefOf, type Place, readPlace, treePlace } from "../../web/sample/places";

const places: [string, Place][] = [
  ["/sample", treePlace(null)],
  ["/sample/tree/p1", treePlace("p1")],
  [
    "/sample/tree/p1?siblings=open&union=p2&half=descendants",
    { screen: "tree", person: "p1", siblings: true, open: "p2", half: "descendants" },
  ],
  ["/sample/branches", branchesPlace()],
  ["/sample/branches?person=p1&branch=b3", branchesPlace({ person: "p1", branch: "b3" })],
  ["/sample/branches?as=fan", branchesPlace({ as: "fan" })],
  [
    "/sample/branches?as=fan&person=p1&with=p2",
    branchesPlace({ as: "fan", person: "p1", partner: "p2" }),
  ],
  ["/sample/generations", { screen: "generations", person: null }],
  ["/sample/generations/p1", { screen: "generations", person: "p1" }],
  ["/sample/person/p1", { screen: "person", person: "p1" }],
  ["/sample/list/p1", { screen: "list", person: "p1" }],
];

it.each(places)("%s is a place and back", (href, place) => {
  expect(hrefOf(place)).toBe(href);
  const { pathname, search } = new URL(href, "https://x");
  expect(readPlace(pathname, search)).toEqual(place);
  // The Worker serves the page there.
  expect(parseSamplePath(pathname)).not.toBeNull();
});

it.each([
  "/",
  "/sample/people",
  "/sample/tree",
  "/sample/branches/b1",
  "/sample/generations/",
  "/sampler",
])("%s is no place", (path) => {
  expect(readPlace(path, "")).toBeNull();
});

it.each([
  ["level=other", {}],
  ["person=%3Cb%3E", {}],
  ["at=p1", {}],
  ["at=p1.x.y", {}],
  ["scale=0", {}],
  ["scale=-2", {}],
  ["scale=1000", {}],
  ["scale=abc", {}],
  ["other=1", {}],
])("leaves out what it does not understand: %s", (search, place) => {
  expect(readPlace("/sample/branches", `?${search}`)).toEqual(branchesPlace(place));
});

it("reads an address of the old map or canvas as the pages, on the same person", () => {
  expect(readPlace("/sample/branches", "?level=near&person=p1&at=p7.-12.340&scale=2")).toEqual(
    branchesPlace({ person: "p1" }),
  );
});
