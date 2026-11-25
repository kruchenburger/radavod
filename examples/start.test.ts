import { describe, expect, it } from "vitest";
import type { ExampleFamily } from "./family.ts";
import { generateFamily } from "./generate.ts";
import { kinOf } from "./kin.ts";
import { sampleOf } from "./snapshot.ts";
import { fullestOfLine } from "./start.ts";

const family = generateFamily(1, 300);

describe("the one who stands in the centre first", () => {
  const kin = kinOf(family);
  const { start, line } = sampleOf(family);
  const step = (ids: string[], next: (id: string) => string[]): string[] => [
    ...new Set(ids.flatMap(next)),
  ];

  it("is on the direct line of one of the last couple", () => {
    const last = family.unions.find(({ id }) => id === family.lastCouple);
    expect(last?.partners).toContain(line);
    expect(kin.ancestors(line).has(start)).toBe(true);
  });

  it.each([
    ["up", kin.parents],
    ["down", kin.children],
  ] as const)("has three generations %s", (_, next) => {
    let front = [start];
    for (let i = 0; i < 3; i += 1) {
      front = step(front, next);
      expect(front.length).toBeGreaterThan(0);
    }
  });

  it("has several unions or children", () => {
    const [partners, children] = [kin.partners(start), kin.children(start)];
    expect(new Set(partners).size > 1 || new Set(children).size > 2).toBe(true);
  });
});

/** A straight line of people, with the children and the partners told. */
function lineOf(more: Record<string, { children?: number; partners?: number }>): ExampleFamily {
  const parentages: ExampleFamily["parentages"] = [];
  const unions: ExampleFamily["unions"] = [];
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const link = (child: string, parent: string): void => {
    parentages.push({
      id: `${child}${parent}`,
      child,
      parent,
      kind: "blood",
      main: true,
      certainty: "confirmed",
    });
  };
  ids.slice(1).forEach((id, i) => link(id, ids[i] as string));
  const people = [...ids];
  for (const [id, { children = 0, partners = 0 }] of Object.entries(more)) {
    for (let i = 0; i < children; i += 1) {
      people.push(`${id}-child${i}`);
      link(`${id}-child${i}`, id);
    }
    for (let i = 0; i < partners; i += 1) {
      people.push(`${id}-partner${i}`);
      unions.push({
        id: `${id}-union${i}`,
        kind: "marriage",
        partners: [id, `${id}-partner${i}`],
        certainty: "confirmed",
      });
    }
  }
  return {
    ...family,
    people: people.map((id) => ({ ...family.people[0]!, id })),
    parentages,
    unions,
  };
}

describe("the rule", () => {
  it.each([
    ["several children", { d: { children: 2 } }, "d"],
    ["several unions", { d: { partners: 2 } }, "d"],
    ["the most people around", { d: { partners: 2 }, e: { partners: 2 }, g: { children: 4 } }, "e"],
    ["the first when that is the same", { d: { partners: 2 }, e: { partners: 2 } }, "d"],
  ])("takes the one with %s", (_, more, expected) => {
    expect(fullestOfLine(lineOf(more), "h")).toBe(expected);
  });

  it.each([
    ["one child and one partner", { d: { partners: 1 } }],
    ["two generations above", { c: { children: 9 } }],
    ["two generations below", { f: { children: 9 } }],
  ])("takes nobody with %s only", (_, more) => {
    expect(fullestOfLine(lineOf(more), "h")).toBeNull();
  });

  it("takes nobody off the line", () => {
    const own = lineOf({ d: { children: 2 } });
    expect(fullestOfLine(own, "d-child0")).toBe("d");
    expect(fullestOfLine(own, "c")).toBeNull();
  });
});
