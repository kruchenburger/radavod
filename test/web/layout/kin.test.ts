import { describe, expect, it } from "vitest";
import { kinOf } from "../../../web/tree/layout/kin";
import { familyOf } from "./family";

const sets = (snapshot: ReturnType<typeof familyOf>, child: string) =>
  kinOf(snapshot)
    .sets(child)
    .map(({ known, unknown, kind, main }) => ({ known, unknown: unknown.length, kind, main }));

describe("the parents of a person", () => {
  it("stand together when they are of one kind", () => {
    const snapshot = familyOf({
      people: ["a", "b", "c", "d", { id: "x", parents: ["a", "b", adopted("c"), adopted("d")] }],
    });
    expect(sets(snapshot, "x")).toEqual([
      { known: ["a", "b"], unknown: 0, kind: "blood", main: true },
      { known: ["c", "d"], unknown: 0, kind: "adoption", main: true },
    ]);
  });

  it("puts the main blood parents first, whatever is told first", () => {
    const snapshot = familyOf({
      people: ["a", "b", "c", { id: "x", parents: [version("c"), adopted("b"), "a"] }],
    });
    expect(sets(snapshot, "x").map(({ known }) => known)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("keeps a place for an unknown one", () => {
    const snapshot = familyOf({ people: ["a", { id: "x", parents: ["a", null] }] });
    expect(sets(snapshot, "x")).toEqual([{ known: ["a"], unknown: 1, kind: "blood", main: true }]);
  });

  it("keeps two versions of one parent apart, and a couple of versions together", () => {
    const rivals = { id: "x", parents: [version("a"), version("b")] };
    const people = ["a", "b", rivals];
    expect(sets(familyOf({ people }), "x").map(({ known }) => known)).toEqual([["a"], ["b"]]);
    expect(sets(familyOf({ people, unions: [["b", "a"]] }), "x")[0]?.known).toEqual(["a", "b"]);
  });

  it("are told once each", () => {
    const snapshot = familyOf({
      people: ["a", { id: "x", parents: [version("a"), adopted("a"), "a"] }],
    });
    expect(sets(snapshot, "x")).toEqual([{ known: ["a"], unknown: 0, kind: "blood", main: true }]);
  });

  it("are not those who are not there, nor the person", () => {
    const snapshot = familyOf({ people: [{ id: "x", parents: ["x", "nobody"] }] });
    expect(sets(snapshot, "x")).toEqual([]);
  });
});

describe("the children of a person", () => {
  it("come in the order of birth, the undated ones after", () => {
    const snapshot = familyOf({
      people: [
        "a",
        { id: "late", born: 1905, parents: ["a"] },
        { id: "undated", parents: ["a"] },
        { id: "early", born: 1900, parents: ["a"] },
      ],
    });
    const children = kinOf(snapshot).children("a");
    expect(children.map(({ child }) => child)).toEqual(["early", "late", "undated"]);
  });
});

describe("the partners of a person", () => {
  it("come in the order of time: by the date of the union, else by the first child", () => {
    const snapshot = familyOf({
      people: [
        "a",
        "b",
        "c",
        "d",
        { id: "x", born: 1900, parents: ["a", "c"] },
        { id: "y", born: 1890, parents: ["a", "d"] },
      ],
      unions: [
        ["a", "b"],
        ["a", "c"],
        ["d", "a"],
      ],
    });
    const partners = (): (string | null)[] =>
      kinOf({ ...snapshot })
        .unions("a")
        .map(({ other }) => other);
    expect(partners()).toEqual(["d", "c", "b"]);
    Object.assign(snapshot.unions[0] ?? {}, { began: 1880 * 365 });
    expect(partners()).toEqual(["b", "d", "c"]);
  });

  it("come in the order of the snapshot without any date, each once", () => {
    const snapshot = familyOf({
      people: ["a", "b", "c"],
      unions: [
        ["a", "c"],
        ["b", "a"],
        ["c", "a"],
        ["a", "a"],
        ["a", "nobody"],
      ],
    });
    expect(
      kinOf(snapshot)
        .unions("a")
        .map(({ other }) => other),
    ).toEqual(["c", "b"]);
  });

  it("stand by the earliest of their unions, and keep all of them", () => {
    const snapshot = familyOf({
      people: ["a", "b", "c"],
      unions: [
        ["a", "c"],
        ["a", "b"],
        ["b", "a"],
      ],
    });
    [50, 90, 10].forEach((began, i) => Object.assign(snapshot.unions[i] ?? {}, { began }));
    const unions = kinOf(snapshot).unions("a");
    expect(unions.map(({ other }) => other)).toEqual(["b", "c"]);
    expect(unions[0]?.all.map(({ id }) => id)).toEqual(["u2", "u1"]);
    expect(kinOf(snapshot).couples).toHaveLength(2);
  });

  it("may be unknown", () => {
    const snapshot = familyOf({ people: ["a"], unions: [["a", null]] });
    expect(
      kinOf(snapshot)
        .unions("a")
        .map(({ other }) => other),
    ).toEqual([null]);
  });
});

describe("the direct line", () => {
  it("is the person and the main blood ancestors", () => {
    const snapshot = familyOf({
      people: [
        "grandfather",
        { id: "father", parents: ["grandfather"] },
        "adoptive",
        "version",
        { id: "x", parents: ["father", adopted("adoptive"), version("version")] },
        { id: "child", parents: ["x"] },
      ],
    });
    expect([...kinOf(snapshot).lineOf("x")].sort()).toEqual(["father", "grandfather", "x"]);
  });

  it("ends when ancestors go in a circle", () => {
    const snapshot = familyOf({
      people: [
        { id: "a", parents: ["b"] },
        { id: "b", parents: ["a"] },
      ],
    });
    expect([...kinOf(snapshot).lineOf("a")].sort()).toEqual(["a", "b"]);
  });

  it("is empty for nobody", () => {
    expect(kinOf(familyOf({ people: ["a"] })).lineOf("nobody").size).toBe(0);
    expect(kinOf(familyOf({ people: ["a"] })).lineOf(null).size).toBe(0);
  });
});

it("takes the first of two people with one id", () => {
  const snapshot = familyOf({
    people: [
      { id: "a", given: "first" },
      { id: "a", given: "second" },
    ],
  });
  expect(kinOf(snapshot).ids).toEqual(["a"]);
  expect(kinOf(snapshot).person("a")?.name?.given).toBe("first");
});

it("is made once for a snapshot", () => {
  const snapshot = familyOf({ people: ["a"] });
  expect(kinOf(snapshot)).toBe(kinOf(snapshot));
});

function adopted(parent: string) {
  return { parent, kind: "adoption" as const };
}

function version(parent: string) {
  return { parent, main: false };
}
