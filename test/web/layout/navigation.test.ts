import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import { around } from "../../../web/tree/layout/around";
import { branchMap } from "../../../web/tree/layout/branch-map";
import { cardIndex } from "../../../web/tree/layout/hit";
import { type Arrow, aroundKeys, listKeys, mapKeys, pageKeys } from "../../../web/tree/layout/keys";
import { relativesOf } from "../../../web/tree/layout/relatives";
import { unreachable } from "./reach";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";

const family: FamilySpec = {
  people: [
    { id: "gf", branch: "A" },
    "gm",
    { id: "f", branch: "A", parents: ["gf", "gm"], born: 1900 },
    { id: "uncle", branch: "A", parents: ["gf", "gm"], born: 1905 },
    { id: "m", branch: "B" },
    { id: "older", branch: "A", parents: ["f", "m"], born: 1925 },
    { id: "x", branch: "A", parents: ["f", "m"], born: 1930 },
    { id: "half", branch: "A", parents: ["f", "other"], born: 1940 },
    "other",
    "wife",
    { id: "son", branch: "A", parents: ["x", "wife"], born: 1960 },
    { id: "ward", branch: "A", parents: [{ parent: "x", kind: "guardianship" }], born: 1950 },
  ],
  unions: [
    ["gf", "gm"],
    ["f", "m"],
    ["f", "other"],
    ["x", "wife"],
    ["x", null],
  ],
  branches: ["A", "B"],
};
const snapshot = familyOf(family);
const map = branchMap(snapshot, {
  level: "closer",
  measure,
  headOf: ({ title }) => title.ru,
  lineOf: "x",
});
const view = around(snapshot, "x", { measure, wording: wordingOf(snapshot), lineOf: "x" });

describe("hit testing", () => {
  const index = cardIndex(map.cards);

  it("finds the card under a point and nothing beside it", () => {
    for (const card of map.cards) {
      expect(index.at(card.x + card.w / 2, card.y + card.h / 2)?.key).toBe(card.key);
    }
    expect(index.at(-50, -50)).toBeNull();
    expect(cardIndex([]).at(0, 0)).toBeNull();
  });

  it("takes the nearest within a finger's reach", () => {
    const [card] = map.cards;
    if (card === undefined) throw new Error("no cards");
    expect(index.at(card.x - 6, card.y + 1)).toBeNull();
    expect(index.at(card.x - 6, card.y + 1, 10)?.key).toBe(card.key);
  });

  it("finds everybody in a window and nobody outside", () => {
    const window = { x: 100, y: 100, w: 400, h: 120 };
    const isIn = ({ x, y, w, h }: (typeof map.cards)[number]): boolean =>
      x < 500 && x + w > 100 && y < 220 && y + h > 100;
    expect(
      index
        .within(window)
        .map(({ key }) => key)
        .sort(),
    ).toEqual(
      map.cards
        .filter(isIn)
        .map(({ key }) => key)
        .sort(),
    );
  });
});

describe("the keyboard on the map", () => {
  const move = mapKeys(map);
  const go = (from: string, arrow: Arrow, cameFrom?: string): string | null =>
    move(`p:${from}`, arrow, cameFrom === undefined ? null : `p:${cameFrom}`)?.slice(2) ?? null;

  it("goes up to a parent, the one on the direct line first", () => {
    expect(go("x", "up")).toBe("f");
    expect(go("f", "up")).toBe("gf");
    expect(go("gf", "up")).toBeNull();
  });

  it("goes down to the child one came from, else along the direct line, else to the first", () => {
    expect(go("f", "down", "half")).toBe("half");
    expect(go("f", "down")).toBe("x");
    expect(go("f", "down", "gf")).toBe("x");
    expect(go("x", "down")).toBe("ward");
    expect(go("wife", "down")).toBe("son");
    expect(go("son", "down")).toBeNull();
  });

  it("goes along the row of the page", () => {
    expect(go("f", "right")).toBe("m");
    expect(go("m", "left")).toBe("f");
    expect(go("gf", "left")).toBeNull();
  });

  it("reaches everybody", () => {
    const example = snapshotOf(generateFamily(1, 300));
    const all = branchMap(example, { level: "near", measure, headOf: ({ title }) => title.ru });
    const step = mapKeys(all);
    expect(unreachable(all.cards, step)).toEqual([]);
  });

  it("loses nobody when a family goes to another page and comes back", () => {
    const people = [
      { id: "G", branch: "A" },
      { id: "P", branch: "B", parents: ["G"] },
      { id: "Y", branch: "B", parents: ["P"] },
      { id: "X", branch: "A", parents: ["P"] },
      { id: "below", branch: "A", parents: ["X"] },
    ];
    const lost = branchMap(familyOf({ people, branches: ["A", "B"] }), {
      level: "near",
      measure,
      headOf: ({ title }) => title.ru,
    });
    expect(unreachable(lost.cards, mapKeys(lost))).toEqual([]);
  });

  it("knows nothing of strangers", () => {
    expect(go("nobody", "up")).toBeNull();
    expect(go("nobody", "left")).toBeNull();
  });
});

describe("the keyboard on pages", () => {
  const branches = ["A", "B", "C", "D", "E"];
  const people = branches.map((branch) => ({ id: branch, branch }));
  const pages = branchMap(familyOf({ people, branches }), {
    level: "far",
    measure,
    headOf: ({ title }) => title.ru,
    perRow: 2,
  });
  const move = pageKeys(pages);

  it("goes to the page before, after, above and below", () => {
    expect(move(0, "right")).toBe(1);
    expect(move(1, "right")).toBe(2);
    expect(move(0, "left")).toBeNull();
    expect(move(0, "down")).toBe(2);
    expect(move(3, "up")).toBe(1);
    expect(move(3, "down")).toBeNull();
    expect(move(4, "right")).toBeNull();
  });
});

describe("the keyboard around a person", () => {
  const move = aroundKeys(view);
  const go = (from: string, arrow: Arrow): string | null =>
    move(`p:${from}`, arrow, null)?.slice(2) ?? null;

  it("goes left to parents, right to children, up and down a column", () => {
    expect(go("x", "left")).toBe("f");
    expect(go("f", "right")).toBe("x");
    expect(go("x", "right")).toBe("ward");
    expect(go("f", "down")).toBe("m");
    expect(go("m", "up")).toBe("f");
    expect(go("gf", "left")).toBeNull();
  });

  it("loses nobody, a column of one reference neither", () => {
    const example = snapshotOf(generateFamily(1, 300));
    for (const { id } of example.people) {
      const layout = around(example, id, { measure, wording: wordingOf(example) });
      expect(unreachable(layout.cards, aroundKeys(layout))).toEqual([]);
    }
  });

  it("goes through a list one by one", () => {
    const step = listKeys(["a", "b"]);
    expect([step("a", "down"), step("b", "up"), step("b", "down"), step("a", "left")]).toEqual([
      "b",
      "a",
      null,
      null,
    ]);
  });
});

describe("the list of relatives", () => {
  it("names parents, siblings, unions and children", () => {
    expect(relativesOf(snapshot, "x")).toEqual({
      parents: [
        { person: "f", kind: "blood", main: true, certainty: "confirmed" },
        { person: "m", kind: "blood", main: true, certainty: "confirmed" },
      ],
      siblings: [
        {
          person: "older",
          shared: [
            { parent: "f", own: "blood", theirs: "blood" },
            { parent: "m", own: "blood", theirs: "blood" },
          ],
        },
        { person: "half", shared: [{ parent: "f", own: "blood", theirs: "blood" }] },
      ],
      unions: [
        {
          union: "u3",
          partner: "wife",
          kind: "marriage",
          certainty: "confirmed",
          children: [{ person: "son", kind: "blood", main: true, certainty: "confirmed" }],
        },
        { union: "u4", partner: null, kind: "marriage", certainty: "confirmed", children: [] },
      ],
      otherChildren: [{ person: "ward", kind: "guardianship", main: true, certainty: "confirmed" }],
    });
  });

  it("keeps an unknown parent and a parent of the children who is no partner", () => {
    const people = ["m", { id: "x", parents: ["m", null] }, { id: "y", parents: ["m", "x"] }];
    const told = relativesOf(familyOf({ people }), "x");
    expect(told?.parents.map(({ person }) => person)).toEqual(["m", null]);
    expect(told?.unions).toMatchObject([
      { union: null, partner: "m", children: [{ person: "y" }] },
    ]);
  });

  it("tells the certainty of every parent and child apart", () => {
    const people = [
      "m",
      {
        id: "x",
        parents: [
          { parent: "m", certainty: "confirmed" as const },
          { parent: null, certainty: "unresolved" as const },
        ],
      },
    ];
    const told = familyOf({ people });
    expect(relativesOf(told, "x")?.parents.map(({ certainty }) => certainty)).toEqual([
      "confirmed",
      "unresolved",
    ]);
    expect(relativesOf(told, "m")?.otherChildren).toMatchObject([{ certainty: "confirmed" }]);
  });

  it("finds the other parent over all kinds of parentage", () => {
    const step = { parent: "step", kind: "adoption" as const };
    const guardian = { parent: "guardian", kind: "guardianship" as const };
    const rival = { parent: "rival", main: false };
    const people = [
      "m",
      "step",
      "guardian",
      "rival",
      { id: "wed", parents: ["m", step] },
      { id: "unwed", parents: ["guardian", step] },
      { id: "ward", parents: ["m", guardian] },
      { id: "disputed", parents: ["m", rival] },
    ];
    const told = familyOf({ people, unions: [["m", "step"]] });
    const family = (person: string) => {
      const { unions = [], otherChildren = [] } = relativesOf(told, person) ?? {};
      return {
        unions: unions.map(({ partner, children }) => [partner, children.map((c) => c.person)]),
        others: otherChildren.map((c) => c.person),
      };
    };
    expect(family("m")).toEqual({
      unions: [["step", ["wed"]]],
      others: ["ward", "disputed"],
    });
    expect(family("step")).toEqual({
      unions: [
        ["m", ["wed"]],
        ["guardian", ["unwed"]],
      ],
      others: [],
    });
    // A guardian brings up a child of somebody else.
    expect(family("guardian").others).toEqual(["ward"]);
    expect(family("rival")).toEqual({ unions: [["m", ["disputed"]]], others: [] });
  });

  it("names every union of the same two, with its own children", () => {
    const people = [
      "a",
      "b",
      { id: "first", born: 1, parents: ["a", "b"] },
      { id: "second", born: 9, parents: [{ parent: "a", union: "u1" }, "b"] },
    ];
    const told = familyOf({
      people,
      unions: [
        ["a", "b"],
        ["b", "a"],
      ],
    });
    Object.assign(told.unions[1] ?? {}, { kind: "civil", certainty: "hypothesis" });
    expect(relativesOf(told, "a")?.unions).toMatchObject([
      { union: "u0", partner: "b", kind: "marriage", children: [{ person: "first" }] },
      {
        union: "u1",
        partner: "b",
        kind: "civil",
        certainty: "hypothesis",
        children: [{ person: "second" }],
      },
    ]);
  });

  it("gives children to the right one of two unknown partners", () => {
    const people = [
      "a",
      { id: "x", parents: [{ parent: "a", union: "u1" }, null] },
      { id: "y", parents: [{ parent: "a", union: "gone" }, null] },
    ];
    const told = familyOf({
      people,
      unions: [
        ["a", null],
        ["a", null],
      ],
    });
    expect(
      relativesOf(told, "a")?.unions.map(({ children }) => children.map(({ person }) => person)),
    ).toEqual([["y"], ["x"]]);
  });

  it("marks a sibling by guardianship and leaves out those of a rejected version", () => {
    const people = [
      "m",
      "guardian",
      "rejected",
      {
        id: "x",
        parents: [
          "m",
          { parent: "guardian", kind: "guardianship" as const },
          { parent: "rejected", main: false },
        ],
      },
      { id: "child-of-guardian", parents: ["guardian"] },
      { id: "child-of-rejected", parents: ["rejected"] },
      { id: "doubtful", parents: [{ parent: "m", main: false }] },
    ];
    expect(relativesOf(familyOf({ people }), "x")?.siblings).toEqual([
      {
        person: "child-of-guardian",
        shared: [{ parent: "guardian", own: "guardianship", theirs: "blood" }],
      },
    ]);
  });

  it("is null for nobody", () => {
    expect(relativesOf(snapshot, "nobody")).toBeNull();
  });
});
