import { describe, expect, it } from "vitest";
import type { LifeEvent } from "../../src/contexts/life";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { PersonId } from "../../src/kernel/id";
import { restoreTo } from "../../src/scenarios/restore-to";
import { previewRestore, restore, trash } from "../../src/scenarios/trash";
import { undo } from "../../src/scenarios/undo";
import type { State } from "../../src/shared/reverse";
import {
  accepted,
  addBranch,
  addParent,
  addPerson,
  addUnion,
  anna,
  branch,
  citation,
  event,
  inTree,
  parentage,
  person,
  place,
  source,
  type Tree,
  union,
} from "./tree";

const act = { actor: anna, now: 5 };
const drop = (tree: Tree, who: string) => accepted(tree.run((c) => trash(c, person(who), act)));
const bring = (tree: Tree, who: string) => accepted(tree.run((c) => restore(c, person(who)))).value;
const preview = (tree: Tree, who: string) => accepted(previewRestore(tree.work, person(who)));
const stateOf = (tree: Tree): State => tree.read((c) => c.history.state());
const refused = (code: string, more: object = {}) => ({
  ok: false,
  error: expect.objectContaining({ code, ...more }),
});
const nothing = { becomeVersions: [], dropped: [], waiting: [] };

const told = (name: string, kind: LifeEvent["kind"], ...who: string[]): LifeEvent => ({
  id: event(name),
  kind,
  title: "",
  date: parseFuzzyDate("1885"),
  place: null,
  participants: who.map((one, i) => ({
    person: person(one),
    role: i === 0 ? "principal" : "witness",
  })),
  union: null,
  main: true,
  certainty: "hypothesis",
  note: "",
});

/** Ada with a parent, a partner, two children, events, citations and a branch. */
const family = (tree: Tree): void => {
  tree.do((c) => {
    for (const who of ["ada", "mother", "eve", "kid", "son", "guest", "other"]) addPerson(c, who);
    addBranch(c, "green");
    accepted(
      c.kinship.apply({
        do: "assign-branch",
        person: person("ada"),
        branch: branch("green"),
        descendants: false,
        overwrite: false,
      }),
    );
    addUnion(c, "u", "ada", "eve");
    accepted(
      c.kinship.apply({ do: "edit-union", id: union("u"), patch: { branch: branch("green") } }),
    );
    addParent(c, "ada", "mother");
    addParent(c, "kid", "ada", { union: union("u") });
    addParent(c, "kid", "eve", { union: union("u") });
    addParent(c, "son", "ada", { kind: "adoption" });
    accepted(
      c.kinship.apply({
        do: "order-children",
        person: person("ada"),
        order: [person("son"), person("kid")],
      }),
    );
    accepted(c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }));
    accepted(c.life.add({ ...told("birth", "birth", "ada", "mother"), place: place("town") }));
    accepted(c.life.add({ ...told("wedding", "wedding", "ada", "eve"), union: union("u") }));
    accepted(c.life.add(told("baptism", "baptism", "guest", "ada", "other")));
    accepted(
      c.evidence.addSource({
        id: source("book"),
        kind: "book",
        title: "",
        repository: "",
        note: "",
      }),
    );
    for (const [id, fact] of [
      ["c1", { subject: person("ada"), fact: "name:n1" }],
      ["c2", { subject: union("u"), fact: "union" }],
    ] as const) {
      accepted(
        c.evidence.cite({ id: citation(id), source: source("book"), fact, page: "", quote: "" }),
      );
    }
  });
};

describe("a person in the trash", () => {
  it("is gone from the tree with every link, and nothing names them", () =>
    inTree((tree) => {
      family(tree);
      const result = drop(tree, "ada");
      expect(result.changed.map(({ aggregate }) => aggregate)).toContain(`trash/${person("ada")}`);
      tree.read((c) => {
        expect(c.kinship.get(person("ada"))).toBeNull();
        expect(c.kinship.union(union("u"))).toBeNull();
        expect(c.kinship.get(person("mother"))?.children).toEqual([]);
        expect(c.kinship.get(person("eve"))).toMatchObject({
          unions: [],
          children: [person("kid")],
        });
        expect(c.kinship.get(person("kid"))?.parents).toMatchObject([
          { parent: person("eve"), union: null },
        ]);
        expect(c.kinship.get(person("son"))?.parents).toEqual([]);
        expect(c.life.eventsOf(person("eve"))).toEqual([]);
        expect(c.life.eventsOf(person("guest"))[0]?.participants).toHaveLength(2);
        expect(c.evidence.citationsOf(union("u"))).toEqual([]);
      });
      const { history_trash, history_entry, history_subject, ...rows } = tree.rows();
      expect(JSON.stringify(rows)).not.toContain(person("ada"));
      expect(history_trash).toHaveLength(1);
      void history_entry;
      void history_subject;
    }));

  it("comes back as they were", () =>
    inTree((tree) => {
      family(tree);
      const before = stateOf(tree);
      drop(tree, "ada");
      expect(preview(tree, "ada")).toEqual(nothing);
      expect(bring(tree, "ada")).toEqual(nothing);
      const after = stateOf(tree);
      // Lists hold the same things; what was taken out of a list is put back at its end.
      const sorted = (state: State) =>
        JSON.stringify(state, (_, value) =>
          Array.isArray(value)
            ? [...value].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
            : value,
        );
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      for (const key of Object.keys(before)) {
        expect([key, sorted({ [key]: after[key] })]).toEqual([key, sorted({ [key]: before[key] })]);
      }
      tree.read((c) => {
        expect(c.kinship.get(person("ada"))).toMatchObject({
          branch: branch("green"),
          childOrder: [person("son"), person("kid")],
          unions: [union("u")],
        });
        expect(c.life.eventsOf(person("eve"))).toHaveLength(1);
      });
      expect(tree.rows().history_trash).toEqual([]);
    }));

  it("is put there and taken out by entries that can be undone and returned to", () =>
    inTree((tree) => {
      family(tree);
      const before = stateOf(tree);
      drop(tree, "ada");
      const dropped = stateOf(tree);
      accepted(tree.run((c) => undo(c, 2)));
      expect(stateOf(tree)).toEqual(before);
      accepted(tree.run((c) => restoreTo(c, 2)));
      expect(stateOf(tree)).toEqual(dropped);
      bring(tree, "ada");
      accepted(tree.run((c) => restoreTo(c, 1)));
      expect(stateOf(tree)).toEqual(before);
      expect(tree.rows().history_trash).toEqual([]);
    }));

  it("is refused when not there, and restored only from the trash", () =>
    inTree((tree) => {
      family(tree);
      expect(tree.run((c) => trash(c, person("nobody"), act))).toEqual(refused("missing"));
      expect(tree.run((c) => restore(c, person("ada")))).toEqual(refused("missing"));
      expect(previewRestore(tree.work, person("ada"))).toEqual(refused("missing"));
    }));
});

/** The preview is the same as what the restore then does, and writes nothing. */
function restoreAsPreviewed(tree: Tree, who: string) {
  const rows = tree.rows();
  const plan = preview(tree, who);
  expect(tree.rows()).toEqual(rows);
  expect(bring(tree, who)).toEqual(plan);
  return plan;
}

describe("a restore after the tree went on", () => {
  it("makes a version of a parentage whose place is taken", () =>
    inTree((tree) => {
      family(tree);
      drop(tree, "ada");
      tree.do((c) => addParent(c, "kid", "other"));
      const plan = restoreAsPreviewed(tree, "ada");
      expect(plan).toMatchObject({
        becomeVersions: [{ parent: person("ada"), main: false }],
        dropped: [],
      });
      const links = tree.read((c) => c.kinship.get(person("kid"))?.parents) ?? [];
      expect(links.find(({ parent }) => parent === person("ada"))?.main).toBe(false);
      expect(links.filter(({ main }) => main)).toHaveLength(2);
    }));

  it("drops what would be a cycle", () =>
    inTree((tree) => {
      family(tree);
      drop(tree, "ada");
      tree.do((c) => addParent(c, "mother", "kid"));
      const plan = restoreAsPreviewed(tree, "ada");
      expect(plan.dropped).toEqual([{ kind: "parentage", other: person("kid") }]);
      expect(tree.read((c) => c.kinship.get(person("ada"))?.parents)).toHaveLength(1);
    }));

  it("drops a link to whoever is gone, a source, a branch and a place that are gone", () =>
    inTree((tree) => {
      family(tree);
      drop(tree, "ada");
      tree.do((c) => {
        for (const child of ["kid"]) {
          accepted(c.kinship.apply({ do: "remove-parent", child: person(child), id: "eve" }));
        }
        accepted(c.kinship.apply({ do: "remove-person", id: person("eve") }));
        accepted(c.kinship.apply({ do: "remove-person", id: person("son") }));
        accepted(c.kinship.apply({ do: "remove-person", id: person("mother") }));
        accepted(c.kinship.apply({ do: "remove-branch", id: branch("green") }));
        accepted(c.evidence.removeSource(source("book")));
        accepted(c.places.remove(place("town")));
        accepted(c.life.remove(person("guest"), event("baptism")));
      });
      const plan = restoreAsPreviewed(tree, "ada");
      expect(plan.dropped).toEqual(
        expect.arrayContaining([
          { kind: "union", other: person("eve") },
          { kind: "parentage", other: person("mother") },
          { kind: "parentage", other: person("son") },
          { kind: "event", other: person("guest") },
          { kind: "source", other: source("book") },
          { kind: "branch", other: branch("green") },
        ]),
      );
      tree.read((c) => {
        const ada = c.kinship.get(person("ada"));
        expect(ada).toMatchObject({ branch: null, unions: [], parents: [] });
        expect(ada?.children).toEqual([person("kid")]);
        expect(c.life.eventsOf(person("ada")).map(({ place: at }) => at)).toEqual([null, null]);
        expect(c.life.event(person("ada"), event("wedding"))?.participants).toHaveLength(1);
      });
    }));

  it.each([
    ["ada", "kid"],
    ["kid", "ada"],
    ["ada", "eve"],
    ["eve", "ada"],
    ["ada", "mother"],
    ["mother", "ada"],
    ["guest", "ada"],
    ["ada", "guest"],
  ])("waits for others in the trash: %s, %s gone and back in either order", (first, second) =>
    inTree((tree) => {
      for (const order of [
        [first, second],
        [second, first],
      ]) {
        const links = (who: string) =>
          tree.read((c) => {
            const id = person(who);
            const one = c.kinship.get(id);
            return {
              parents: one?.parents.map(({ parent }) => parent).sort(),
              children: one?.children.toSorted(),
              unions: one?.unions,
              events: c.life
                .eventsOf(id)
                .map((e) => e.id)
                .sort(),
            };
          });
        if (tree.entries === 0) family(tree);
        const before = ["ada", "eve", "kid", "mother", "guest", "other"].map(links);
        drop(tree, first);
        drop(tree, second);
        const waits = restoreAsPreviewed(tree, order[0] ?? "");
        expect(waits.dropped).toEqual([]);
        expect(restoreAsPreviewed(tree, order[1] ?? "")).toMatchObject({
          dropped: [],
          waiting: [],
        });
        expect(["ada", "eve", "kid", "mother", "guest", "other"].map(links)).toEqual(before);
        expect(tree.rows().history_trash).toEqual([]);
      }
    }),
  );

  it("keeps a record that is not what it should be apart", () =>
    inTree((tree) => {
      family(tree);
      drop(tree, "ada");
      tree.storage.sql.exec(`UPDATE history_trash SET data = '{"person":"Тайна"}'`);
      expect(() => tree.run((c) => restore(c, person("ada")))).toThrow(
        /^corrupt-row trash\/person_\w{22}$/,
      );
    }));
});

describe("removing a person at once", () => {
  it("is refused while anybody names them", () =>
    inTree((tree) => {
      family(tree);
      const remove = (id: PersonId) =>
        tree.run((c) => c.kinship.apply({ do: "remove-person", id }));
      expect(remove(person("ada"))).toEqual(refused("in-use", { count: 3 }));
      expect(remove(person("nobody"))).toEqual(refused("missing"));
      tree.do((c) => addPerson(c, "free"));
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "add-parent",
            child: person("free"),
            parentage: parentage("other"),
          }),
        ),
      );
      expect(remove(person("free")).ok).toBe(true);
      expect(tree.read((c) => c.kinship.get(person("other"))?.children)).toEqual([]);
    }));
});
