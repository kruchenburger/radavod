import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import { around } from "../../../web/tree/layout/around";
import { branchMap } from "../../../web/tree/layout/branch-map";
import { cardIndex } from "../../../web/tree/layout/hit";
import { type Arrow, aroundKeys, listKeys, mapKeys, pageKeys } from "../../../web/tree/layout/keys";
import { peopleByPage, relativesOf } from "../../../web/tree/layout/relatives";
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
    for (const page of all.pages.keys()) {
      const people = all.cards.filter((card) => card.page === page && card.person !== null);
      const seen = new Set([people[0]?.key ?? ""]);
      for (const key of seen) {
        for (const arrow of ["up", "down", "left", "right"] as const) {
          const next = step(key, arrow, null);
          if (next !== null) seen.add(next);
        }
      }
      const rows = new Set(people.map(({ row }) => row));
      const found = new Set(people.filter(({ key }) => seen.has(key)).map(({ row }) => row));
      // Every row can be walked whole, so reaching a row reaches its people.
      expect(found.size).toBe(rows.size);
    }
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
        { person: "older", shared: ["f", "m"] },
        { person: "half", shared: ["f"] },
      ],
      unions: [
        {
          union: "u3",
          partner: "wife",
          children: [{ person: "son", kind: "blood", main: true, certainty: "confirmed" }],
        },
        { union: "u4", partner: null, children: [] },
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

  it("is null for nobody", () => {
    expect(relativesOf(snapshot, "nobody")).toBeNull();
  });
});

describe("the list of everybody", () => {
  it("goes page by page, generation by generation, and leaves out nobody", () => {
    const list = peopleByPage(map);
    expect(list.map(({ branch }) => branch)).toEqual(["A", "B"]);
    expect(list[0]?.generations[0]).toEqual(["gf", "gm"]);
    const all = list.flatMap(({ generations }) => generations.flat());
    expect([...all].sort()).toEqual(snapshot.people.map(({ id }) => id).sort());
  });
});
