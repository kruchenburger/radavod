import { describe, expect, it } from "vitest";
import { detailRuns } from "../../../web/tree/layout/around-text";
import { cut, flow, nameLines } from "../../../web/tree/layout/text";
import type { Measure } from "../../../web/tree/layout/types";

const measure: Measure = (text) => [...text].length * 10;
const run = (text: string, part: "given" | "surname" = "given") => ({
  text,
  part,
  style: "name" as const,
});
const options = { measure, width: 100, lines: 2, lineHeight: 20 };
const told = (lines: { text: string; x: number; y: number }[]) =>
  lines.map(({ text, x, y }) => [text, x, y]);

describe("cut", () => {
  it("leaves a text that fits", () => {
    expect(cut("Anna", "name", 40, measure)).toBe("Anna");
  });

  it("ends a longer one with an ellipsis", () => {
    expect(cut("Annabella", "name", 50, measure)).toBe("Anna…");
  });

  it("never parts a letter from its accent", () => {
    expect(cut("Zoébella", "name", 40, measure)).toBe("Zo…");
    expect(cut("😀😀😀😀", "name", 30, measure)).toBe("😀😀…");
  });

  it("is empty when not even the ellipsis fits", () => {
    expect(cut("Anna", "name", 5, measure)).toBe("");
  });
});

describe("flow", () => {
  it("keeps short runs on one line, each with its own place", () => {
    expect(told(flow([run("Anna"), run("Wolf", "surname")], options))).toEqual([
      ["Anna", 0, 0],
      ["Wolf", 50, 0],
    ]);
  });

  it("goes on to the next line at a word", () => {
    expect(told(flow([run("Anna Maria"), run("Wolf", "surname")], options))).toEqual([
      ["Anna Maria", 0, 0],
      ["Wolf", 0, 20],
    ]);
  });

  it("cuts what the last line cannot hold", () => {
    expect(told(flow([run("Anna Maria Elisabeth Johanna")], options))).toEqual([
      ["Anna Maria", 0, 0],
      ["Elisabeth…", 0, 20],
    ]);
  });

  it("cuts a word longer than a line", () => {
    expect(told(flow([run("A".repeat(500)), run("Wolf", "surname")], options))).toEqual([
      [`${"A".repeat(9)}…`, 0, 0],
      ["Wolf", 0, 20],
    ]);
  });

  it("goes on after a hyphen", () => {
    expect(told(flow([run("Polynich-Zabolot")], options))).toEqual([
      ["Polynich-", 0, 0],
      ["Zabolot", 0, 20],
    ]);
    expect(told(flow([run("Ab-Cd")], options))).toEqual([["Ab-Cd", 0, 0]]);
  });

  it("has no lines for no words", () => {
    expect(flow([run(""), run("  ")], options)).toEqual([]);
  });

  it("never breaks at a no-break space", () => {
    expect(told(flow([run("Ab Cdefgh\u00a0Ij")], options))).toEqual([
      ["Ab", 0, 0],
      ["Cdefgh\u00a0Ij", 0, 20],
    ]);
  });
});

describe("years and the branch", () => {
  const text = { given: "Anna", surname: "Wolf", years: "before 1824–1893", branch: "no branch" };
  const texts = (runs: { text: string }[]) => runs.map(({ text }) => text);

  it("stand apart, the dot staying with the years when the branch goes down a line", () => {
    expect(texts(detailRuns(text))).toEqual(["before 1824–1893\u00a0·", "no branch"]);
    const lines = flow(detailRuns(text), { ...options, width: 120, lines: 3 });
    expect(told(lines)).toEqual([
      ["before", 0, 0],
      ["1824–1893\u00a0·", 0, 20],
      ["no branch", 0, 40],
    ]);
  });

  it("have no dot when no branch is shown", () => {
    expect(texts(detailRuns({ ...text, branch: "" }))).toEqual(["before 1824–1893", ""]);
  });
});

describe("a name", () => {
  const name = (given: string, surname: string, indent = 0) =>
    told(nameLines(run(given), run(surname, "surname"), { ...options, indent }));

  it("is one line when it fits", () => {
    expect(name("Anna", "Wolf")).toEqual([
      ["Anna", 0, 0],
      ["Wolf", 50, 0],
    ]);
  });

  it("breaks between the given name and the surname", () => {
    expect(name("Anna", "Zabolotska")).toEqual([
      ["Anna", 0, 0],
      ["Zabolotska", 0, 20],
    ]);
    expect(name("Anna B", "Wolf")).toEqual([
      ["Anna B", 0, 0],
      ["Wolf", 0, 20],
    ]);
  });

  it("leaves room before its first line", () => {
    expect(name("Anna", "Wolf", 20)).toEqual([
      ["Anna", 20, 0],
      ["Wolf", 0, 20],
    ]);
  });

  it("cuts a given name that has no room after the sign", () => {
    expect(name("Maximiliana", "Wolf", 20)).toEqual([
      ["Maximil…", 20, 0],
      ["Wolf", 0, 20],
    ]);
  });

  it("may have no given name or no surname", () => {
    expect(name("", "Wolf")).toEqual([["Wolf", 0, 0]]);
    expect(name("Anna", "")).toEqual([["Anna", 0, 0]]);
    expect(name("", "")).toEqual([]);
  });
});
