import { expect, it } from "vitest";
import { kinOf } from "../../web/tree/layout/kin";
import { shareOneParent } from "../../web/tree/siblings";
import { familyOf, type PersonSpec } from "./layout/family";

const shares = (a: PersonSpec["parents"], b: PersonSpec["parents"]): boolean[] => {
  const kin = kinOf(
    familyOf({
      people: [
        "mother",
        "father",
        "stepfather",
        { id: "a", parents: a ?? [] },
        { id: "b", parents: b ?? [] },
      ],
    }),
  );
  return kin.siblings("a").map((sibling) => shareOneParent(kin, "a", sibling));
};

it("says it of two people with two known parents each", () => {
  expect(shares(["mother", "father"], ["mother", "stepfather"])).toEqual([true]);
});

it.each([
  ["share both", ["mother", "father"], ["mother", "father"]],
  ["have one parent told of each", ["mother"], ["mother"]],
  ["have a second parent told of one only", ["mother", "father"], ["mother"]],
  ["have a second parent nobody knows", ["mother", null], ["mother", null]],
  ["have a second parent nobody knows of one", ["mother", "father"], ["mother", null]],
  [
    "have a second parent in a version only",
    ["mother", "father"],
    ["mother", { parent: "stepfather", main: false }],
  ],
])("says nothing of two who %s", (_, a, b) => {
  expect(shares(a, b)).toEqual([false]);
});
