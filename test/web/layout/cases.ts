import type { FamilySpec } from "./family";

const long = "Слово".repeat(100);
const wives = Array.from({ length: 12 }, (_, i) => `w${i}`);

/** Families that are hard to draw. Every view must manage every one of them. */
export const cases: Record<string, FamilySpec> = {
  "no people": { people: [] },
  "no people and a branch": { people: [], branches: ["empty"] },
  "one person": { people: ["x"] },
  "an unknown parent": { people: ["m", { id: "x", parents: ["m", null] }] },
  "two unknown parents": { people: [{ id: "x", parents: [null, null] }] },
  "an unknown partner": { people: ["x", { id: "y", parents: ["x", null] }], unions: [["x", null]] },
  "families that are no kin": {
    people: [
      { id: "a", branch: "A" },
      { id: "b", branch: "B", parents: ["c"] },
      { id: "c", branch: "B" },
      "d",
      { id: "e", parents: ["d"] },
      "f",
    ],
    unions: [["e", "f"]],
    branches: ["A", "B"],
  },
  "parents of every kind": {
    people: [
      "a",
      "b",
      "c",
      "d",
      "e",
      "g",
      {
        id: "x",
        branch: "A",
        parents: [
          "a",
          "b",
          { parent: "c", kind: "adoption" },
          { parent: "d", kind: "adoption" },
          { parent: "e", kind: "guardianship" },
          { parent: "g", main: false },
        ],
      },
    ],
    unions: [
      ["a", "b"],
      ["c", "d"],
    ],
    branches: ["A"],
  },
  "an ancestor by two lines": {
    people: [
      { id: "a", branch: "A" },
      "b",
      { id: "p", branch: "A", parents: ["a", "b"], born: 1 },
      { id: "q", branch: "A", parents: ["a", "b"], born: 2 },
      { id: "f", branch: "A", parents: ["p"] },
      { id: "m", branch: "A", parents: ["q"] },
      { id: "x", branch: "A", parents: ["f", "m"] },
    ],
    unions: [
      ["a", "b"],
      ["f", "m"],
    ],
    branches: ["A"],
  },
  "a branch that marries a branch": {
    people: [
      { id: "a", branch: "A" },
      { id: "b", branch: "B" },
      { id: "c", branch: "A", parents: ["a"], born: 1 },
      { id: "d", branch: "B", parents: ["b"], born: 2 },
      { id: "e", branch: "A", parents: ["c", "d"] },
      { id: "f", branch: "C" },
      { id: "g", branch: "C", parents: ["e", "f"] },
    ],
    unions: [
      ["c", "d"],
      ["e", "f"],
    ],
    branches: ["A", "B", "C"],
  },
  "twelve unions": {
    people: [
      { id: "x", branch: "A" },
      ...wives,
      ...wives.flatMap((wife, i) => [
        { id: `${wife}-1`, branch: "A", parents: ["x", wife], born: 1900 + i },
        { id: `${wife}-2`, branch: "A", parents: ["x", wife], born: 1950 + i },
      ]),
    ],
    unions: wives.map((wife): [string, string] => ["x", wife]),
    branches: ["A"],
  },
  "a person married to a child, a grandchild and a parent": {
    people: [
      { id: "a", branch: "A" },
      { id: "b", branch: "A", parents: ["a"] },
      { id: "x", branch: "A", parents: ["b"] },
      { id: "c", branch: "A", parents: ["x"] },
      { id: "d", branch: "B", parents: ["c"] },
    ],
    unions: [
      ["x", "c"],
      ["x", "d"],
      ["b", "x"],
      ["a", "x"],
    ],
    branches: ["A", "B"],
  },
  "a widow, her second husband and her daughter": {
    people: [
      { id: "widow", branch: "A" },
      "first",
      "young",
      { id: "daughter", branch: "A", parents: ["first", "widow"] },
      { id: "x", branch: "A", parents: ["young", "daughter"] },
    ],
    unions: [
      ["first", "widow"],
      ["young", "widow"],
      ["young", "daughter"],
    ],
    branches: ["A"],
  },
  "a man and two sisters": {
    people: [
      { id: "x", branch: "A" },
      { id: "p", branch: "B" },
      { id: "s1", branch: "B", parents: ["p"], born: 1 },
      { id: "brother", branch: "B", parents: ["p"], born: 2 },
      { id: "s2", branch: "B", parents: ["p"], born: 3 },
      { id: "c1", parents: ["x", "s1"] },
      { id: "c2", parents: ["x", "s2"] },
    ],
    unions: [
      ["x", "s1"],
      ["x", "s2"],
    ],
    branches: ["A", "B"],
  },
  "a chain of marriages": {
    people: ["a", "b", "c", "d", "e", { id: "x", parents: ["c", "d"], branch: "A" }],
    unions: [
      ["a", "b"],
      ["c", "d"],
      ["b", "c"],
      ["d", "e"],
      ["a", "e"],
    ],
    branches: ["A"],
  },
  "their own ancestors": {
    people: [
      { id: "a", branch: "A", parents: ["c"] },
      { id: "b", branch: "A", parents: ["a"] },
      { id: "c", branch: "B", parents: ["b"] },
      { id: "self", parents: ["self"] },
    ],
    unions: [["a", "b"]],
    branches: ["A", "B"],
  },
  "parents who are no couple": {
    people: [
      { id: "f", branch: "A" },
      { id: "m", branch: "B" },
      { id: "x", branch: "A", parents: ["f", "m"], born: 5 },
      { id: "y", branch: "B", parents: ["f", "m"], born: 1 },
      { id: "z", branch: "A", parents: ["m", "f"] },
    ],
    branches: ["A", "B"],
  },
  "names of five hundred letters": {
    people: [
      { id: "x", given: long, surname: long, branch: long },
      { id: "y", given: "Ян ".repeat(160), surname: long, parents: ["x"] },
    ],
    branches: [long],
  },
  "no names": {
    people: [
      { id: "x", given: "", surname: "" },
      { id: "y", given: "", surname: "", parents: ["x"] },
    ],
  },
  "branches and people who are not there": {
    people: [{ id: "x", branch: "nowhere", parents: ["nobody"] }, "y"],
    unions: [
      ["x", "nobody"],
      ["x", "x"],
      ["nobody", null],
    ],
  },
  "one id for two people": {
    people: ["x", "x", { id: "y", parents: ["x"] }, { id: "y", parents: ["y"] }],
    unions: [["x", "y"]],
  },
  "ids that look like something else": {
    people: ["__proto__", "p:a", "a", "?:parent a", { id: "x", parents: ["__proto__", "p:a"] }],
    unions: [["__proto__", "p:a"]],
    branches: ["__proto__", "constructor"],
  },
  "a long row of generations": {
    people: Array.from({ length: 60 }, (_, i) => ({
      id: `g${i}`,
      branch: i % 7 === 3 ? "B" : "A",
      parents: i === 0 ? [] : [`g${i - 1}`],
    })),
    branches: ["A", "B"],
  },
  "many versions of one father": {
    people: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, branch: i % 2 ? "A" : "B" })),
      {
        id: "x",
        branch: "A",
        parents: Array.from({ length: 8 }, (_, i) => ({ parent: `f${i}`, main: i === 0 })),
      },
    ],
    branches: ["A", "B"],
  },
};
