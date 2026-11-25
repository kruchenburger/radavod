import { describe, expect, it } from "vitest";
import { type Parentage, probablyDead } from "../../src/contexts/kinship";
import type { NameForm } from "../../src/kernel/name-form";
import { sortKey, parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import { branch, Family, person, union } from "./memory-kinship";

const refused = (code: string, more: object = {}) => ({ ok: false, error: { code, ...more } });
const names = (...list: string[]) => list.map(person);

describe("a parent", () => {
  it("is written with the child and mirrored at the parent", () => {
    const family = new Family("child", "mother");
    expect(family.addParent("child", "mother").ok).toBe(true);
    expect(family.get("child").parents).toEqual([
      {
        id: "child-mother",
        parent: person("mother"),
        union: null,
        kind: "blood",
        main: true,
        certainty: "hypothesis",
      },
    ]);
    expect(family.get("mother").children).toEqual(names("child"));
  });

  it("changes nothing but the two people", () => {
    const family = new Family("child", "mother", "other");
    const change = family.addParent("child", "mother");
    expect(change.ok && change.value.map(({ kind, id }) => [kind, id])).toEqual([
      ["person", person("child")],
      ["person", person("mother")],
    ]);
    const [write] = change.ok ? change.value : [];
    expect(write).toMatchObject({ before: { parents: [] }, after: { parents: [{}] } });
  });

  it("who is not in the tree is refused, and so is the child", () => {
    const family = new Family("child");
    expect(family.addParent("child", "nobody")).toEqual(
      refused("missing", { id: person("nobody") }),
    );
    expect(family.addParent("nobody", "child")).toEqual(
      refused("missing", { id: person("nobody") }),
    );
  });

  it("may be unknown, more than once", () => {
    const family = new Family("child");
    family.withParent("child", "unknown", { id: "first" });
    family.withParent("child", "unknown", { id: "second" });
    expect(family.get("child").parents.map(({ parent }) => parent)).toEqual(["unknown", "unknown"]);
  });

  it("is refused a second time with the same kind, whatever version", () => {
    const family = new Family("child", "mother");
    family.withParent("child", "mother");
    expect(family.addParent("child", "mother", { id: "again", main: false })).toEqual(
      refused("duplicate"),
    );
    expect(family.addParent("child", "mother", { id: "again", kind: "adoption" }).ok).toBe(true);
    expect(family.get("mother").children).toEqual(names("child"));
  });

  it("is refused with the identifier of another parentage", () => {
    const family = new Family("child", "mother", "father");
    family.withParent("child", "mother", { id: "one" });
    expect(family.addParent("child", "father", { id: "one" })).toEqual(refused("duplicate"));
  });
});

describe("a cycle", () => {
  it("of one person is refused, whatever the kind", () => {
    const family = new Family("a");
    for (const kind of ["blood", "adoption", "guardianship", "unknown"] as const) {
      expect(family.addParent("a", "a", { kind })).toEqual(
        refused("cycle", { path: names("a", "a") }),
      );
    }
  });

  it("through two commands is refused with the way round", () => {
    const family = new Family("a", "b", "c");
    family.withParent("a", "b");
    family.withParent("b", "c");
    // Each is a parent of the one before.
    expect(family.addParent("c", "a")).toEqual(
      refused("cycle", { path: names("c", "a", "b", "c") }),
    );
  });

  it("is told by the shortest way", () => {
    const family = new Family("top", "a", "b", "c", "d", "middle", "upper");
    family.withParent("a", "b");
    family.withParent("b", "middle");
    family.withParent("a", "c", { kind: "adoption" });
    family.withParent("c", "d");
    family.withParent("d", "middle");
    family.withParent("middle", "upper");
    family.withParent("upper", "top");
    expect(family.addParent("top", "a")).toEqual(
      refused("cycle", { path: names("top", "a", "b", "middle", "upper", "top") }),
    );
  });

  it("of blood and adoption together is refused", () => {
    const family = new Family("a", "b");
    family.withParent("a", "b", { kind: "adoption" });
    expect(family.addParent("b", "a")).toEqual(refused("cycle", { path: names("b", "a", "b") }));
    expect(family.addParent("b", "a", { kind: "adoption" }).ok).toBe(false);
  });

  it("through a version is refused, and so is a version that closes one", () => {
    const family = new Family("a", "b", "c", "d");
    family.withParent("a", "b", { main: false });
    expect(family.addParent("b", "a").ok).toBe(false);
    family.withParent("c", "d");
    expect(family.addParent("d", "c", { main: false })).toEqual(
      refused("cycle", { path: names("d", "c", "d") }),
    );
  });

  it("through guardianship or an unknown kind is no cycle", () => {
    for (const kind of ["guardianship", "unknown"] as const) {
      const family = new Family("a", "b");
      family.withParent("a", "b", { kind });
      expect(family.addParent("b", "a").ok).toBe(true);
      const other = new Family("a", "b");
      other.withParent("a", "b");
      expect(other.addParent("b", "a", { kind }).ok).toBe(true);
    }
  });

  it("appears when a link becomes one of blood, and that is refused", () => {
    const family = new Family("a", "b");
    family.withParent("a", "b");
    family.withParent("b", "a", { kind: "guardianship" });
    const command = {
      do: "edit-parent",
      child: person("b"),
      id: "b-a",
      patch: { kind: "adoption" },
    } as const;
    expect(family.apply(command)).toEqual(refused("cycle", { path: names("b", "a", "b") }));
    expect(family.get("b").parents[0]?.kind).toBe("guardianship");
  });

  it("does not follow from a common ancestor or an unknown parent", () => {
    const family = new Family("a", "b", "c", "top");
    family.withParent("a", "b");
    family.withParent("a", "c");
    family.withParent("b", "top");
    family.withParent("c", "top");
    family.withParent("top", "unknown");
    expect(family.addParent("top", "a").ok).toBe(false);
    expect(family.addParent("b", "unknown").ok).toBe(true);
  });

  it("is looked for in one reading per ancestor", () => {
    const family = new Family();
    const { store } = family;
    // 2 500 generations of couples who are brother and sister: 2 to the power of 2 500 lines up.
    const generations = 2500;
    const link = (id: string, parent: string): Parentage => ({
      id,
      parent: person(parent),
      union: null,
      kind: "blood",
      main: true,
      certainty: "hypothesis",
    });
    family.add("seed");
    const like = family.get("seed");
    for (let i = 0; i < generations; i++) {
      const up = i + 1 < generations;
      const parents = up ? [link("f", `m${i + 1}`), link("s", `w${i + 1}`)] : [];
      const children = i === 0 ? [] : names(`m${i - 1}`, `w${i - 1}`);
      for (const name of [`m${i}`, `w${i}`]) {
        store.people.set(person(name), { ...like, id: person(name), parents, children });
      }
    }
    family.add("new");
    store.asked = [];
    expect(family.addParent("new", "m0").ok).toBe(true);
    expect(store.asked.length).toBe(generations * 2 - 1);
    expect(new Set(store.asked).size).toBe(store.asked.length);

    const closing = family.addParent("w2499", "new");
    expect(closing).toMatchObject(refused("cycle"));
    expect(!closing.ok && closing.error.code === "cycle" && closing.error.path.length).toBe(2502);
  });
});

describe("main blood parents", () => {
  it("are two at most, versions and other kinds are not counted", () => {
    const family = new Family("child", "a", "b", "c", "d", "e");
    family.withParent("child", "a");
    family.withParent("child", "b");
    expect(family.addParent("child", "c")).toEqual(refused("third-main-blood-parent"));
    family.withParent("child", "c", { main: false });
    family.withParent("child", "d", { kind: "adoption" });
    family.withParent("child", "e", { kind: "guardianship" });
    expect(family.get("child").parents).toHaveLength(5);
  });

  it("count an unknown one", () => {
    const family = new Family("child", "a", "b");
    family.withParent("child", "a");
    family.withParent("child", "unknown");
    expect(family.addParent("child", "b")).toEqual(refused("third-main-blood-parent"));
    expect(family.addParent("child", "unknown", { id: "more" })).toEqual(
      refused("third-main-blood-parent"),
    );
  });

  it("do not become three by an edit", () => {
    const family = new Family("child", "a", "b", "c", "d");
    family.withParent("child", "a");
    family.withParent("child", "b");
    family.withParent("child", "c", { main: false });
    family.withParent("child", "d", { kind: "adoption" });
    const edit = (id: string, patch: object) =>
      family.apply({ do: "edit-parent", child: person("child"), id, patch });
    expect(edit("child-c", { main: true })).toEqual(refused("third-main-blood-parent"));
    expect(edit("child-d", { kind: "blood" })).toEqual(refused("third-main-blood-parent"));
    expect(edit("child-a", { certainty: "unresolved" }).ok).toBe(true);
    expect(edit("child-a", { main: false }).ok).toBe(true);
    expect(edit("child-c", { main: true }).ok).toBe(true);
  });
});

describe("a parentage", () => {
  it("is edited in its place", () => {
    const family = new Family("child", "a", "b");
    family.withParent("child", "a");
    family.withParent("child", "b");
    family.do({
      do: "edit-parent",
      child: person("child"),
      id: "child-a",
      patch: { kind: "adoption", main: false, certainty: "contradiction" },
    });
    expect(family.get("child").parents[0]).toMatchObject({
      parent: person("a"),
      kind: "adoption",
      main: false,
      certainty: "contradiction",
    });
  });

  it("does not become another one of the same parent and kind", () => {
    const family = new Family("child", "a");
    family.withParent("child", "a");
    family.withParent("child", "a", { id: "more", kind: "adoption" });
    expect(
      family.apply({
        do: "edit-parent",
        child: person("child"),
        id: "more",
        patch: { kind: "blood" },
      }),
    ).toEqual(refused("duplicate"));
  });

  it("gets the parent who was unknown, and the parent gets the child", () => {
    const family = new Family("child", "a");
    family.withParent("child", "unknown", { id: "p" });
    const edit = (parent: string) =>
      family.apply({
        do: "edit-parent",
        child: person("child"),
        id: "p",
        patch: { parent: person(parent) },
      });
    expect(edit("nobody")).toEqual(refused("missing", { id: person("nobody") }));
    expect(edit("child")).toEqual(refused("cycle", { path: names("child", "child") }));
    expect(edit("a").ok).toBe(true);
    expect(family.get("a").children).toEqual(names("child"));
    family.do({
      do: "edit-parent",
      child: person("child"),
      id: "p",
      patch: { parent: "unknown" },
    });
    expect(family.get("a").children).toEqual([]);
  });

  it("is removed at both ends, and the child leaves the order", () => {
    const family = new Family("child", "a");
    family.withParent("child", "a");
    family.withParent("child", "a", { id: "more", kind: "guardianship" });
    family.do({ do: "order-children", person: person("a"), order: names("child") });
    const remove = (id: string) =>
      family.apply({ do: "remove-parent", child: person("child"), id });
    expect(remove("child-a").ok).toBe(true);
    expect(family.get("a").children).toEqual(names("child"));
    expect(remove("more").ok).toBe(true);
    expect(family.get("a").children).toEqual([]);
    expect(family.get("a").childOrder).toEqual([]);
    expect(remove("more")).toEqual(refused("missing", { id: "more" }));
  });

  it("belongs to a union of that parent only", () => {
    const family = new Family("child", "a", "b", "c");
    family.withUnion("ab", "a", "b");
    family.withUnion("cx", "c", "unknown");
    family.withParent("child", "a", { union: union("ab") });
    expect(family.addParent("child", "b", { union: union("none") })).toEqual(
      refused("missing", { id: union("none") }),
    );
    expect(family.addParent("child", "b", { union: union("cx") })).toEqual(
      refused("not-a-partner"),
    );
    // Nobody could find the child by the union, for an unknown parent keeps no children.
    expect(family.addParent("child", "unknown", { union: union("cx") })).toEqual(
      refused("not-a-partner"),
    );
    const edit = (patch: object) =>
      family.apply({ do: "edit-parent", child: person("child"), id: "child-a", patch });
    expect(edit({ parent: "unknown" })).toEqual(refused("not-a-partner"));
    expect(edit({ parent: "unknown", union: null }).ok).toBe(true);
  });
});

describe("a union", () => {
  it("stands at both partners, and a person may have three", () => {
    const family = new Family("a", "b", "c", "d");
    family.withUnion("ab", "a", "b");
    family.withUnion("ac", "a", "c");
    family.withUnion("ad", "a", "d");
    expect(family.get("a").unions).toEqual(["ab", "ac", "ad"].map(union));
    expect(family.get("c").unions).toEqual([union("ac")]);
    expect(family.kinship.union(union("ab"))?.partners).toEqual(names("a", "b"));
  });

  it("may join relatives, the same two again, and somebody nobody knows", () => {
    const family = new Family("child", "a");
    family.withParent("child", "a");
    family.withUnion("one", "child", "a");
    family.withUnion("two", "a", "child");
    family.withUnion("three", "a", "unknown");
    expect(family.get("a").unions).toHaveLength(3);
  });

  it("is refused of one person, of somebody missing and with a taken identifier", () => {
    const family = new Family("a", "b");
    family.withUnion("ab", "a", "b");
    const add = (id: string, first: string, second: string) =>
      family.apply({
        do: "add-union",
        union: {
          id: union(id),
          partners: [person(first), person(second)],
          kind: "civil",
          branch: null,
          certainty: "hypothesis",
        },
      });
    expect(add("aa", "a", "a")).toEqual(refused("same-person"));
    expect(add("ax", "a", "x")).toEqual(refused("missing", { id: person("x") }));
    expect(add("ab", "a", "b")).toEqual(refused("duplicate"));
  });

  it("has a branch of its own, whatever branches the partners are in", () => {
    const family = new Family("a", "b");
    family.withBranch("green");
    family.withUnion("ab", "a", "b");
    const give = (id: string) =>
      family.apply({ do: "edit-union", id: union("ab"), patch: { branch: branch(id) } });
    expect(give("none")).toEqual(refused("missing", { id: branch("none") }));
    expect(give("green").ok).toBe(true);
    expect(family.kinship.union(union("ab"))?.branch).toBe(branch("green"));
    expect(family.get("a").branch).toBeNull();
  });

  it("gets the partner who was unknown", () => {
    const family = new Family("a", "b", "child");
    family.withUnion("ax", "a", "unknown");
    family.withParent("child", "a", { union: union("ax") });
    family.do({
      do: "edit-union",
      id: union("ax"),
      patch: { partners: [person("a"), person("b")] },
    });
    expect(family.get("b").unions).toEqual([union("ax")]);
    expect(family.get("child").parents).toMatchObject([{ union: union("ax") }]);
  });

  it("loses a partner, and the children by that one are of no union", () => {
    const family = new Family("a", "b", "c", "child", "other");
    family.withUnion("ab", "a", "b");
    family.withUnion("bc", "b", "c");
    family.withParent("child", "a", { union: union("ab") });
    family.withParent("child", "b", { union: union("ab") });
    family.withParent("other", "b", { union: union("bc") });
    family.do({
      do: "edit-union",
      id: union("ab"),
      patch: { partners: [person("c"), person("a")] },
    });
    expect(family.get("b").unions).toEqual([union("bc")]);
    expect(family.get("child").parents).toMatchObject([
      { parent: person("a"), union: union("ab") },
      { parent: person("b"), union: null },
    ]);
    expect(family.get("other").parents).toMatchObject([{ union: union("bc") }]);
  });

  it("is changed, and refused as it is when it is added", () => {
    const family = new Family("a", "b");
    family.withUnion("ab", "a", "b");
    const edit = (patch: object) => family.apply({ do: "edit-union", id: union("ab"), patch });
    expect(edit({ kind: "civil", certainty: "unresolved" }).ok).toBe(true);
    expect(family.kinship.union(union("ab"))).toMatchObject({
      kind: "civil",
      certainty: "unresolved",
    });
    expect(edit({ partners: names("a", "a") })).toEqual(refused("same-person"));
    expect(edit({ partners: names("a", "x") })).toEqual(refused("missing", { id: person("x") }));
    expect(family.apply({ do: "edit-union", id: union("x"), patch: {} })).toEqual(
      refused("missing", { id: union("x") }),
    );
  });

  it("is removed at both partners and at the children, who stay children", () => {
    const family = new Family("a", "b", "child");
    family.withUnion("ab", "a", "b");
    family.withParent("child", "a", { union: union("ab") });
    family.withParent("child", "b", { union: union("ab") });
    family.do({ do: "remove-union", id: union("ab") });
    expect(family.kinship.union(union("ab"))).toBeNull();
    expect(family.get("a").unions).toEqual([]);
    expect(family.get("b").unions).toEqual([]);
    expect(family.get("child").parents.map((p) => [p.parent, p.union])).toEqual([
      [person("a"), null],
      [person("b"), null],
    ]);
    expect(family.apply({ do: "remove-union", id: union("ab") })).toEqual(
      refused("missing", { id: union("ab") }),
    );
  });
});

describe("a branch", () => {
  const assign = (
    family: Family,
    who: string,
    to: string | null,
    descendants: boolean,
    overwrite = false,
  ) =>
    family.apply({
      do: "assign-branch",
      person: person(who),
      branch: to === null ? null : branch(to),
      descendants,
      overwrite,
    });
  const line = () => {
    const family = new Family("top", "son", "daughter", "grandson", "ward", "maybe", "stepson");
    family.withBranch("green");
    family.withBranch("red");
    family.withParent("son", "top");
    family.withParent("daughter", "top", { kind: "adoption" });
    family.withParent("grandson", "son", { kind: "unknown" });
    family.withParent("ward", "son", { kind: "guardianship" });
    family.withParent("maybe", "son", { main: false });
    family.withParent("maybe", "stepson");
    return family;
  };
  const branches = (family: Family) =>
    Object.fromEntries(
      [...family.store.people.values()].map(({ id, branch: b }) => [
        id.slice("person_".length),
        b?.slice("branch_".length) ?? null,
      ]),
    );

  it("is given to one person", () => {
    const family = line();
    expect(assign(family, "top", "green", false).ok).toBe(true);
    expect(branches(family)).toMatchObject({ top: "green", son: null });
    assign(family, "top", "red", false);
    expect(branches(family)).toMatchObject({ top: "red" });
    assign(family, "top", null, false);
    expect(branches(family)).toMatchObject({ top: null });
  });

  it("goes to descendants, but not to wards and not by a version that is not the main one", () => {
    const family = line();
    assign(family, "top", "green", true);
    expect(branches(family)).toEqual({
      top: "green",
      son: "green",
      daughter: "green",
      grandson: "green",
      ward: null,
      maybe: null,
      stepson: null,
    });
  });

  it("skips descendants who have one, but not those below them", () => {
    const family = line();
    assign(family, "son", "red", false);
    assign(family, "top", "green", true);
    expect(branches(family)).toMatchObject({ top: "green", son: "red", grandson: "green" });
    assign(family, "top", "green", true, true);
    expect(branches(family)).toMatchObject({ son: "green" });
  });

  it("is taken from descendants only when told to overwrite", () => {
    const family = line();
    assign(family, "top", "green", true);
    assign(family, "top", null, true);
    expect(branches(family)).toMatchObject({ top: null, son: "green" });
    assign(family, "top", null, true, true);
    expect(branches(family)).toMatchObject({ son: null, grandson: null });
  });

  it("writes members and no people, and nothing for those who are in it", () => {
    const family = line();
    assign(family, "son", "green", false);
    const result = assign(family, "top", "green", true, true);
    expect(result.ok && result.value.map(({ kind, id }) => [kind, id])).toEqual([
      ["member", person("top")],
      ["member", person("daughter")],
      ["member", person("grandson")],
    ]);
  });

  it("ends in a circle of unknown kinship", () => {
    const family = new Family("a", "b");
    family.withBranch("green");
    family.withParent("a", "b", { kind: "unknown" });
    family.withParent("b", "a", { kind: "unknown" });
    expect(assign(family, "a", "green", true).ok).toBe(true);
    expect(branches(family)).toEqual({ a: "green", b: "green" });
  });

  it("or a person who is missing is refused", () => {
    const family = line();
    expect(assign(family, "top", "none", true)).toEqual(refused("missing", { id: branch("none") }));
    expect(assign(family, "x", "green", true)).toEqual(refused("missing", { id: person("x") }));
  });

  it("is added, changed and not added twice", () => {
    const family = line();
    expect(
      family.apply({
        do: "add-branch",
        branch: { id: branch("red"), title: { ru: "", en: "" }, color: 1 },
      }),
    ).toEqual(refused("duplicate"));
    family.do({ do: "edit-branch", id: branch("red"), patch: { color: 11 } });
    expect(family.kinship.branch(branch("red"))).toMatchObject({ color: 11 });
    expect(family.apply({ do: "edit-branch", id: branch("x"), patch: {} })).toEqual(
      refused("missing", { id: branch("x") }),
    );
  });
});

describe("a person", () => {
  const form = (id: string, more: Partial<NameForm> = {}): NameForm => ({
    id,
    language: "ru",
    script: "Cyrl",
    kind: "birth",
    given: "Верес",
    patronymic: "",
    surname: "",
    certainty: "hypothesis",
    ...more,
  });

  it("is added with a branch, and not twice", () => {
    const family = new Family();
    family.withBranch("green");
    const add = (id: string, to: string) =>
      family.apply({
        do: "add-person",
        person: {
          id: person(id),
          sex: "female",
          living: "yes",
          names: [form("n1")],
          mainName: "n1",
        },
        branch: branch(to),
      });
    expect(add("a", "none")).toEqual(refused("missing", { id: branch("none") }));
    expect(add("a", "green").ok).toBe(true);
    expect(family.get("a")).toEqual({
      id: person("a"),
      version: 0,
      sex: "female",
      living: "yes",
      names: [form("n1")],
      mainName: "n1",
      branch: branch("green"),
      parents: [],
      children: [],
      unions: [],
      childOrder: [],
    });
    expect(add("a", "green")).toEqual(refused("duplicate"));
  });

  it("is refused with a main name that is not there, or with two names of one identifier", () => {
    const family = new Family();
    const add = (list: NameForm[], mainName: string | null) =>
      family.apply({
        do: "add-person",
        person: { id: person("a"), sex: "other", living: "no", names: list, mainName },
        branch: null,
      });
    expect(add([form("n1")], "n2")).toEqual(refused("missing", { id: "n2" }));
    expect(add([form("n1"), form("n1")], "n1")).toEqual(refused("duplicate"));
  });

  it("shows the first name it gets, and the next one when that is removed", () => {
    const family = new Family("a");
    const put = (name: NameForm) => family.do({ do: "put-name", person: person("a"), name });
    const remove = (id: string) => family.apply({ do: "remove-name", person: person("a"), id });
    put(form("n1"));
    put(form("n2"));
    expect(family.get("a").mainName).toBe("n1");
    put(form("n1", { given: "Дуб", certainty: "unresolved" }));
    expect(family.get("a").names).toEqual([
      form("n1", { given: "Дуб", certainty: "unresolved" }),
      form("n2"),
    ]);
    remove("n1");
    expect(family.get("a").mainName).toBe("n2");
    remove("n2");
    expect(family.get("a")).toMatchObject({ names: [], mainName: null });
    expect(remove("n2")).toEqual(refused("missing", { id: "n2" }));
  });

  it("is changed, with a main name of its own only", () => {
    const family = new Family("a");
    family.do({ do: "put-name", person: person("a"), name: form("n1") });
    family.do({ do: "put-name", person: person("a"), name: form("n2") });
    const edit = (patch: object) => family.apply({ do: "edit-person", id: person("a"), patch });
    expect(edit({ sex: "male", living: "no", mainName: "n2" }).ok).toBe(true);
    expect(family.get("a")).toMatchObject({ sex: "male", living: "no", mainName: "n2" });
    expect(edit({ mainName: "n3" })).toEqual(refused("missing", { id: "n3" }));
    expect(family.apply({ do: "edit-person", id: person("x"), patch: {} })).toEqual(
      refused("missing", { id: person("x") }),
    );
  });

  it("has children in an order set by hand", () => {
    const family = new Family("a", "x", "y", "z", "other");
    for (const child of ["x", "y", "z"]) family.withParent(child, "a");
    const order = (...list: string[]) =>
      family.apply({ do: "order-children", person: person("a"), order: names(...list) });
    expect(order("z", "x").ok).toBe(true);
    expect(family.get("a").childOrder).toEqual(names("z", "x"));
    expect(order("z", "other")).toEqual(refused("not-a-child", { id: person("other") }));
    expect(order("z", "z")).toEqual(refused("duplicate"));
    expect(order().ok).toBe(true);
  });

  it("has relatives: parents, partners and children, each once", () => {
    const family = new Family("a", "mother", "wife", "son", "sister");
    family.withParent("a", "mother");
    family.withParent("a", "unknown");
    family.withParent("sister", "mother");
    family.withUnion("one", "a", "wife");
    family.withUnion("two", "wife", "a");
    family.withUnion("three", "a", "unknown");
    family.withParent("son", "a");
    expect(family.kinship.relatives(person("a"))).toEqual(names("mother", "wife", "son"));
    expect(family.kinship.relatives(person("x"))).toEqual([]);
    expect(family.kinship.get(person("x"))).toBeNull();
  });

  it("keeps any name as it is written", () => {
    const family = new Family("a");
    const name = form("n1", { given: "Ё".repeat(500), patronymic: "Й", surname: "👶 לאה" });
    family.do({ do: "put-name", person: person("a"), name });
    expect(family.get("a").names).toEqual([name]);
  });
});

describe("a command that changes nothing", () => {
  it("writes nothing", () => {
    const family = new Family("a");
    expect(family.do({ do: "edit-person", id: person("a"), patch: { living: "unknown" } })).toEqual(
      [],
    );
    expect(family.do({ do: "order-children", person: person("a"), order: [] })).toEqual([]);
  });
});

describe("somebody is probably dead", () => {
  const now = Date.UTC(2026, 10, 25, 12);
  const born = (text: string) => sortKey(parseFuzzyDate(text));
  const dead = (living: "yes" | "no" | "unknown", birth: string) => {
    const family = new Family("a");
    return probablyDead({ ...family.get("a"), living }, born(birth), now);
  };

  it("when born over 110 years ago and nobody says they live", () => {
    expect(dead("unknown", "24.11.1916")).toBe(true);
    expect(dead("unknown", "26.11.1916")).toBe(false);
    expect(dead("unknown", "1885")).toBe(true);
    expect(dead("unknown", "1990")).toBe(false);
  });

  it("but not when they live or are known to be dead", () => {
    expect(dead("yes", "1885")).toBe(false);
    expect(dead("no", "1885")).toBe(false);
  });

  it("but not when nobody knows the birth", () => {
    expect(dead("unknown", "")).toBe(false);
    expect(dead("unknown", "до 1885")).toBe(false);
  });
});
