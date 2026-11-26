import { describe, expect, it } from "vitest";
import { reverse, takeBack, valueAt, withoutErased } from "../../src/shared/reverse";

const value = {
  sex: "male",
  names: [
    { id: "n1", given: "Верес" },
    { id: "n2", given: "Дуб" },
  ],
};

describe("a value at a path", () => {
  it("is the whole, a field, a thing or its field, and null where nothing is", () => {
    expect(valueAt(value, "")).toBe(value);
    expect(valueAt(value, "sex")).toBe("male");
    expect(valueAt(value, "names/n2")).toEqual({ id: "n2", given: "Дуб" });
    expect(valueAt(value, "names/n2/given")).toBe("Дуб");
    for (const path of ["age", "names/n3", "names/n3/given", "sex/n1"]) {
      expect([path, valueAt(value, path)]).toEqual([path, null]);
    }
    expect(valueAt(null, "sex")).toBeNull();
  });
});

describe("taking back", () => {
  it("does not change what it is given", () => {
    const before = structuredClone(value);
    takeBack(value, { aggregate: "person/p", path: "names/n1/given", before: "Вяз" });
    takeBack(value, { aggregate: "person/p", path: "names/", before: ["n2", "n1"] });
    takeBack(value, { aggregate: "person/p", path: "names/n1", before: null });
    expect(value).toEqual(before);
  });

  it("puts a list in its order, with what came since at the end", () => {
    const back = takeBack(
      { names: [{ id: "new" }, { id: "n1" }, { id: "n2" }] },
      { aggregate: "person/p", path: "names/", before: ["n2", "n1"] },
    );
    expect(back).toEqual({ names: [{ id: "n2" }, { id: "n1" }, { id: "new" }] });
  });

  it("of a thing in lists that are not there makes them, and leaves none empty", () => {
    const lists = takeBack(null, { aggregate: "life/p", path: "events/e", before: { id: "e" } });
    expect(lists).toEqual({ events: [{ id: "e" }] });
    expect(takeBack(lists, { aggregate: "life/p", path: "events/e", before: null })).toBeNull();
    expect(takeBack(null, { aggregate: "life/p", path: "events/e", before: null })).toBeNull();
    expect(takeBack(null, { aggregate: "life/p", path: "events/", before: ["e"] })).toBeNull();
    expect(takeBack(null, { aggregate: "life/p", path: "events/e/note", before: "" })).toBeNull();
    for (const path of ["sex", "names/n1", "names/n1/given"]) {
      expect(takeBack(null, { aggregate: "person/p", path, before: null })).toBeNull();
    }
    // A person with nothing in any list is still there.
    expect(
      takeBack({ names: [] }, { aggregate: "person/p", path: "names/n1", before: null }),
    ).toEqual({ names: [] });
  });
});

describe("a past with somebody erased", () => {
  it("has an unknown parent in their place", () => {
    const person = {
      parents: [
        { id: "a", parent: "erased", union: "u" },
        { id: "b", parent: "p", union: "u" },
      ],
      childOrder: ["erased", "c"],
    };
    expect(withoutErased("person/x", person)).toEqual({
      parents: [
        { id: "a", parent: "unknown", union: null },
        { id: "b", parent: "p", union: "u" },
      ],
      childOrder: ["c"],
    });
  });

  it("names a link that was named by the erased as a link to nobody known", () => {
    const person = {
      parents: [
        { id: "erased", parent: "erased", union: null },
        { id: "unknown", parent: "unknown", union: null },
        { id: "[erased]-2", parent: "erased", union: null },
      ],
      childOrder: [],
    };
    expect(withoutErased("person/x", person)).toMatchObject({
      parents: [{ id: "unknown-2" }, { id: "unknown" }, { id: "unknown-3" }],
    });
  });

  it("has a union with whoever is left, and none of nobody", () => {
    const union = (...partners: string[]) =>
      withoutErased("union/u", { partners, kind: "civil" }) as { partners: string[] } | null;
    expect(union("a", "b")?.partners).toEqual(["a", "b"]);
    expect(union("a", "unknown")?.partners).toEqual(["a", "unknown"]);
    expect(union("erased", "b")?.partners).toEqual(["b", "unknown"]);
    expect(union("a", "erased")?.partners).toEqual(["a", "unknown"]);
    expect(union("erased", "unknown")).toBeNull();
    expect(union("erased", "erased")).toBeNull();
    const state = { "union/u": { partners: ["erased", "unknown"], kind: "civil" } };
    const patch = { aggregate: "union/u", path: "kind", before: "marriage", after: "civil" };
    expect(reverse(state, [{ patches: [patch] }])).toEqual({});
  });

  it("has events without them", () => {
    const life = {
      events: [{ id: "e", participants: [{ person: "a" }, { person: "erased" }] }],
    };
    expect(withoutErased("life/a", life)).toEqual({
      events: [{ id: "e", participants: [{ person: "a" }] }],
    });
  });

  it("has nobody in the trash with a link to them", () => {
    const trashed = {
      at: 1,
      person: {
        sex: "male",
        parents: [
          { id: "a", parent: "erased" },
          { id: "b", parent: "p" },
        ],
        childOrder: ["c", "erased"],
      },
      children: [{ child: "erased" }, { child: "c" }],
      unions: [
        { id: "u", union: { partners: ["x", "erased"] }, children: [] },
        {
          id: "v",
          union: { partners: ["x", "y"] },
          children: [{ child: "erased" }, { child: "c" }],
        },
      ],
      events: [{ id: "e", participants: [{ person: "x" }, { person: "erased" }] }],
      guest: [{ home: "erased" }, { home: "h" }],
      citations: [],
    };
    expect(withoutErased("trash/x", trashed)).toEqual({
      at: 1,
      person: { sex: "male", parents: [{ id: "b", parent: "p" }], childOrder: ["c"] },
      children: [{ child: "c" }],
      unions: [{ id: "v", union: { partners: ["x", "y"] }, children: [{ child: "c" }] }],
      events: [{ id: "e", participants: [{ person: "x" }] }],
      guest: [{ home: "h" }],
      citations: [],
    });
  });

  it("is the same in other aggregates", () => {
    expect(withoutErased("person-branch/x", "b")).toBe("b");
    expect(withoutErased("source/s", { title: "erased" })).toEqual({ title: "erased" });
    expect(withoutErased("person/x", null)).toBeNull();
  });
});
