import { describe, expect, it } from "vitest";
import type { Card, Line, Link, ParentageLink } from "../../../web/tree/layout/types";
import { familyOf, measure } from "./family";
import { check, type Drawing, type Findings, problems, type Rules } from "./geometry";

// A hand-made drawing of two families. Every test spoils one thing, and the checker must see it.

const snapshot = familyOf({
  people: [
    "father",
    "mother",
    { id: "first", born: 1900, parents: ["father", "mother"] },
    { id: "second", born: 1905, parents: ["father", "mother"] },
    "aunt",
    { id: "cousin", parents: ["aunt"] },
  ],
  unions: [["father", "mother"]],
});

const card = (id: string, x: number, y: number): Card => ({
  key: `p:${id}`,
  person: id,
  direct: false,
  x,
  y,
  w: 100,
  h: 40,
});

const parentage = (link: Partial<ParentageLink> & Pick<ParentageLink, "parents" | "child">) => ({
  type: "parentage" as const,
  family: link.parents.join(),
  certainty: "confirmed" as const,
  direct: false,
  kind: "blood" as const,
  main: true,
  tree: true,
  points: [],
  ...link,
});

const couple = ["p:father", "p:mother"];

function drawing(): Drawing & { lines: Line[] } {
  const links: Link[] = [
    {
      type: "union",
      union: "u0",
      partners: ["p:father", "p:mother"],
      kind: "marriage",
      family: "u0",
      certainty: "confirmed",
      direct: false,
      points: [],
    },
    parentage({
      parents: couple,
      child: "p:first",
      points: [
        [200, 40],
        [200, 70],
        [100, 70],
        [100, 100],
      ],
    }),
    parentage({
      parents: couple,
      child: "p:second",
      points: [
        [200, 40],
        [200, 70],
        [300, 70],
        [300, 100],
      ],
    }),
    parentage({
      parents: ["p:aunt"],
      child: "p:cousin",
      points: [
        [450, 40],
        [450, 100],
      ],
    }),
  ];
  return {
    width: 500,
    height: 140,
    cards: [
      card("father", 100, 0),
      card("mother", 200, 0),
      card("first", 50, 100),
      card("second", 250, 100),
      card("aunt", 400, 0),
      card("cousin", 400, 100),
    ],
    links,
    lines: [{ text: "Anna", part: "given", style: "name", x: 10, y: 5, w: 40, h: 20 }],
  };
}

const rules = (lines: Line[]): Rules => ({
  snapshot,
  people: snapshot.people.map(({ id }) => id),
  children: "x",
  lines: () => lines,
  measure,
});

const at = <T>(list: T[], i: number): T => list[i] as T;

const defects: Record<string, [keyof Findings, (d: ReturnType<typeof drawing>) => void]> = {
  "a card over another": ["overlaps", (d) => (at(d.cards, 2).x = 160)],
  "a person left out": ["missingPeople", (d) => void d.cards.pop()],
  "a person drawn twice": ["duplicates", (d) => void d.cards.push(card("aunt", 0, 60))],
  "the same key on two cards": [
    "duplicates",
    (d) => void d.cards.push({ ...card("x", 0, 60), key: "p:aunt", person: null }),
  ],
  "a stranger": ["extraPeople", (d) => void d.cards.push(card("stranger", 0, 60))],
  "a line through another card": [
    "throughCards",
    (d) => {
      at(d.links, 1).points = [
        [200, 40],
        [200, 70],
        [390, 70],
        [390, 120],
        [150, 120],
      ];
    },
  ],
  "a line through its own card": [
    "throughCards",
    (d) => {
      at(d.links, 3).points = [
        [450, 10],
        [450, 100],
      ];
    },
  ],
  "a line that stops short of the child": [
    "loose",
    (d) => {
      at(d.links, 3).points = [
        [450, 40],
        [450, 90],
      ];
    },
  ],
  "a line from somebody else": [
    "loose",
    (d) => {
      at(d.links, 3).points = [
        [350, 100],
        [400, 100],
      ];
    },
  ],
  "a parentage without a line": ["loose", (d) => (at(d.links, 3).points = [])],
  "a couple that stands apart": ["loose", (d) => (at(d.cards, 1).x = 210)],
  "a line from two people who are no couple": [
    "loose",
    (d) => ((at(d.links, 3) as ParentageLink).parents = ["p:aunt", "p:mother"]),
  ],
  "a link left out": ["missingLinks", (d) => void d.links.pop()],
  "a union left out": ["missingLinks", (d) => void d.links.shift()],
  "one parent of two left out": [
    "missingLinks",
    (d) => ((at(d.links, 1) as ParentageLink).parents = ["p:father"]),
  ],
  "kinship nobody told": [
    "falseLinks",
    (d) => ((at(d.links, 3) as ParentageLink).parents = ["p:aunt", "p:mother"]),
  ],
  "a link to a card that is not there": [
    "falseLinks",
    (d) => ((at(d.links, 3) as ParentageLink).parents = ["p:aunt", "p:nobody"]),
  ],
  "two families on one line": [
    "merged",
    (d) => {
      at(d.links, 3).points = [
        [450, 40],
        [450, 71],
        [250, 71],
        [250, 80],
        [450, 80],
        [450, 100],
      ];
    },
  ],
  "a slanted line": [
    "slanted",
    (d) => {
      at(d.links, 3).points = [
        [440, 40],
        [460, 100],
      ];
    },
  ],
  "children out of order": [
    "unordered",
    (d) => {
      [at(d.cards, 2).x, at(d.cards, 3).x] = [at(d.cards, 3).x, at(d.cards, 2).x];
    },
  ],
  "a text wider than its box": ["textOutside", (d) => (at(d.lines, 0).text = "Annabella")],
  "a text outside its card": ["textOutside", (d) => (at(d.lines, 0).x = 70)],
  "a text over another": [
    "textOutside",
    (d) => void d.lines.push({ ...at(d.lines, 0), x: 40, part: "surname" }),
  ],
  "a reference to nobody": [
    "badReferences",
    (d) => {
      at(d.cards, 4).reference = { as: "child", people: ["nobody"], page: null };
    },
  ],
  "a reference to somebody else": [
    "badReferences",
    (d) => {
      at(d.cards, 4).reference = { as: "child", people: ["first"], page: null };
      (at(d.links, 3) as ParentageLink).childAt = "p:aunt";
    },
  ],
  "a card without a place": ["badNumbers", (d) => (at(d.cards, 5).x = Number.NaN)],
  "a card past the edge": ["outside", (d) => (d.width = 480)],
};

describe("the checker", () => {
  it("has nothing to say about a good drawing", () => {
    const { lines, ...good } = drawing();
    expect(problems(good, rules(lines))).toEqual({});
  });

  it.each(Object.entries(defects))("sees %s", (_, [finding, spoil]) => {
    const spoiled = drawing();
    spoil(spoiled);
    const { lines, ...bad } = spoiled;
    expect(check(bad, rules(lines))[finding]).not.toEqual([]);
  });
});
