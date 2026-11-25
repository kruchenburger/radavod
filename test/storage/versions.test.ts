import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LifeEvent } from "../../src/contexts/life";
import { restoreTo } from "../../src/scenarios/restore-to";
import { startOver } from "../../src/scenarios/start-over";
import { eraseForever, eraseHere } from "../../src/scenarios/erase";
import { undo } from "../../src/scenarios/undo";
import type { Contexts } from "../../src/scenarios/unit-of-work";
import { versionsOf } from "../../src/scenarios/versions";
import { anyone, edit, people, someStep, take, wedding } from "./steps";
import { reverse, type State } from "../../src/shared/reverse";
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
  form,
  inTree,
  person,
  place,
  source,
  type Tree,
  union,
} from "./tree";

const stateOf = (tree: Tree): State => tree.read((c) => c.history.state());
const head = (tree: Tree): number => tree.read((c) => c.history.last());
const refused = (code: string, more: object = {}) => ({
  ok: false,
  error: expect.objectContaining({ code, ...more }),
});

describe("an undo", () => {
  const family = (tree: Tree) =>
    tree.do((c) => {
      for (const who of ["ada", "eve", "kid"]) addPerson(c, who);
    });

  it("takes one edit back, whatever was done elsewhere since, and can be undone", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { living: "no" }))));
      tree.do((c) => accepted(c.kinship.apply(edit("eve", { sex: "female" }))));
      const before = stateOf(tree);
      const result = accepted(tree.run((c) => undo(c, 2)));
      expect(result.changed).toEqual([{ aggregate: `person/${person("ada")}`, version: 5 }]);
      expect(tree.read((c) => c.kinship.get(person("ada")))).toMatchObject({
        sex: "unknown",
        living: "no",
      });
      accepted(tree.run((c) => undo(c, 5)));
      expect(stateOf(tree)).toEqual(before);
    }));

  it("is refused when the same field was changed since, and the edit that did it is named", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "male" }))));
      tree.do((c) => accepted(c.kinship.apply(edit("eve", { sex: "male" }))));
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { living: "no" }))));
      const rows = tree.rows();
      expect(tree.run((c) => undo(c, 2))).toEqual({
        ok: false,
        error: {
          code: "changed-since",
          aggregate: `person/${person("ada")}`,
          path: "sex",
          by: 3,
        },
      });
      expect(tree.rows()).toEqual(rows);
      // It is the value that counts: what was set back is not in the way.
      accepted(tree.run((c) => undo(c, 3)));
      accepted(tree.run((c) => undo(c, 2)));
      expect(tree.read((c) => c.kinship.get(person("ada"))?.sex)).toBe("unknown");
    }));

  it("of one thing in a list does not mind the others, nor their order", () =>
    inTree((tree) => {
      family(tree);
      const put = (id: string, given: string) =>
        tree.do((c) =>
          accepted(
            c.kinship.apply({ do: "put-name", person: person("ada"), name: form(id, { given }) }),
          ),
        );
      put("n2", "Дуб");
      put("n3", "Вяз");
      put("n2", "Клён");
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "remove-name", person: person("ada"), id: "n1" })),
      );
      accepted(tree.run((c) => undo(c, 3)));
      expect(tree.read((c) => c.kinship.get(person("ada"))?.names.map(({ id }) => id))).toEqual([
        "n2",
      ]);
      expect(tree.run((c) => undo(c, 2))).toEqual(
        refused("changed-since", { path: "names/n2", by: 4 }),
      );
      accepted(tree.run((c) => undo(c, 4)));
      expect(tree.read((c) => c.kinship.get(person("ada"))?.names[0]?.given)).toBe("Дуб");
    }));

  it("of a creation removes, of a deletion brings back with its mirrors", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => {
        addUnion(c, "u", "ada", "eve");
        addParent(c, "kid", "ada", { union: union("u") });
        accepted(c.life.add(wedding({ union: union("u") })));
      });
      const before = stateOf(tree);
      accepted(tree.run((c) => undo(c, 2)));
      expect(tree.read((c) => c.kinship.get(person("ada")))).toMatchObject({
        children: [],
        unions: [],
      });
      expect(tree.read((c) => c.life.eventsOf(person("eve")))).toEqual([]);
      accepted(tree.run((c) => undo(c, 3)));
      expect(stateOf(tree)).toEqual(before);
      tree.read((c) => {
        expect(c.kinship.get(person("ada"))).toMatchObject({
          children: [person("kid")],
          unions: [union("u")],
        });
        expect(c.kinship.get(person("eve"))?.unions).toEqual([union("u")]);
        expect(c.life.eventsOf(person("eve"))).toHaveLength(1);
      });
      tree.do((c) => accepted(c.kinship.apply({ do: "remove-union", id: union("u") })));
      accepted(tree.run((c) => undo(c, 5)));
      expect(stateOf(tree)).toEqual(before);
    }));

  it("of a branch given to a line takes it back from all", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => {
        addParent(c, "kid", "ada");
        addBranch(c, "green");
        addBranch(c, "red");
      });
      const give = (to: string) => ({
        do: "assign-branch" as const,
        person: person("ada"),
        branch: branch(to),
        descendants: true,
        overwrite: true,
      });
      tree.do((c) => accepted(c.kinship.apply(give("green"))));
      tree.do((c) => accepted(c.kinship.apply(give("red"))));
      expect(tree.run((c) => undo(c, 3))).toEqual(refused("changed-since", { path: "", by: 4 }));
      accepted(tree.run((c) => undo(c, 4)));
      accepted(tree.run((c) => undo(c, 3)));
      expect(tree.read((c) => c.kinship.get(person("kid"))?.branch)).toBeNull();
    }));

  it("of a creation is refused while something else names it", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => addPerson(c, "late"));
      tree.do((c) => addParent(c, "kid", "late"));
      expect(tree.run((c) => undo(c, 2))).toEqual(refused("in-use"));
      accepted(tree.run((c) => undo(c, 3)));
      accepted(tree.run((c) => undo(c, 2)));
      expect(tree.read((c) => c.kinship.get(person("late")))).toBeNull();

      tree.do((c) => {
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
        addBranch(c, "green");
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        addPerson(c, "more");
      });
      const made = head(tree);
      const uses: ((c: Contexts) => unknown)[] = [
        (c) => c.life.add(wedding({ place: place("town") })),
        (c) =>
          c.kinship.apply({
            do: "assign-branch",
            person: person("ada"),
            branch: branch("green"),
            descendants: false,
            overwrite: false,
          }),
        (c) =>
          c.evidence.cite({
            id: citation("c"),
            source: source("book"),
            fact: { subject: person("ada"), fact: "name:n1" },
            page: "",
            quote: "",
          }),
        (c) =>
          c.life.add({
            ...wedding(),
            participants: [{ person: person("more"), role: "principal" }],
          }),
        (c) => addUnion(c, "u", "more", "eve"),
      ];
      for (const use of uses) {
        tree.do(use);
        expect(tree.run((c) => undo(c, made))).toEqual(refused("in-use"));
        accepted(tree.run((c) => undo(c, c.history.last())));
      }
      accepted(tree.run((c) => undo(c, made)));
      expect(tree.rows()).toMatchObject({ places_place: [], evidence_source: [] });
    }));

  it("does not make the impossible: a cycle, a third parent, a link to nobody", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => {
        addPerson(c, "more");
        addParent(c, "kid", "ada");
        addParent(c, "kid", "eve");
      });
      const drop = (child: string, id: string) =>
        tree.do((c) =>
          accepted(c.kinship.apply({ do: "remove-parent", child: person(child), id })),
        );
      drop("kid", "ada");
      tree.do((c) => addParent(c, "kid", "more"));
      expect(tree.run((c) => undo(c, 3))).toEqual(refused("third-main-blood-parent"));
      drop("kid", "more");
      tree.do((c) => addParent(c, "ada", "kid"));
      expect(tree.run((c) => undo(c, 3))).toEqual(refused("cycle"));
    }));

  it("leaves a name shown, one main birth, and those who take part elsewhere", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "put-name", person: person("ada"), name: form("n2") })),
      );
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { mainName: "n2" }))));
      accepted(tree.run((c) => undo(c, 2)));
      expect(tree.read((c) => c.kinship.get(person("ada"))?.mainName)).toBe("n1");

      const birth = (name: string, main: boolean): LifeEvent => ({
        ...wedding({ id: event(name), kind: "birth", main }),
        participants: [{ person: person("ada"), role: "principal" }],
      });
      tree.do((c) => accepted(c.life.add(birth("one", true))));
      const first = head(tree);
      tree.do((c) => accepted(c.life.add(birth("two", false))));
      tree.do((c) =>
        accepted(
          c.life.add(
            wedding({
              participants: [
                { person: person("eve"), role: "principal" },
                { person: person("ada"), role: "witness" },
              ],
            }),
          ),
        ),
      );
      accepted(tree.run((c) => undo(c, first)));
      expect(tree.read((c) => c.life.main(person("ada"), "birth")?.id)).toBe(event("two"));
      accepted(tree.run((c) => restoreTo(c, first - 1)));
      tree.do((c) =>
        accepted(
          c.life.add(
            wedding({
              participants: [
                { person: person("eve"), role: "principal" },
                { person: person("ada"), role: "witness" },
              ],
            }),
          ),
        ),
      );
      tree.do((c) => accepted(c.life.add(birth("one", true))));
      accepted(tree.run((c) => undo(c, c.history.last())));
      expect(tree.read((c) => c.life.eventsOf(person("ada")).map(({ kind }) => kind))).toEqual([
        "wedding",
      ]);
    }));

  it("is refused when what it would name again has gone", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => {
        addBranch(c, "green");
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        addUnion(c, "u", "ada", "eve");
      });
      const fact = { subject: person("ada"), fact: "name:n1" };
      const give = (to: string | null) => ({
        do: "assign-branch" as const,
        person: person("ada"),
        branch: to === null ? null : branch(to),
        descendants: false,
        overwrite: false,
      });
      tree.do((c) => {
        accepted(c.life.add(wedding({ place: place("town") })));
        accepted(
          c.evidence.cite({
            id: citation("c"),
            source: source("book"),
            fact,
            page: "",
            quote: "",
          }),
        );
        accepted(c.kinship.apply(give("green")));
      });
      const taken: ((c: Contexts) => unknown)[] = [
        (c) => c.life.remove(person("ada"), event("wedding")),
        (c) => c.evidence.uncite(fact, citation("c")),
        (c) => c.kinship.apply(give(null)),
      ];
      const numbers = taken.map((take) => {
        tree.do(take);
        return head(tree);
      });
      tree.do((c) => {
        accepted(c.places.remove(place("town")));
        accepted(c.evidence.removeSource(source("book")));
        accepted(c.kinship.apply({ do: "remove-branch", id: branch("green") }));
      });
      const gone = [place("town"), source("book"), branch("green")];
      for (const [i, number] of numbers.entries()) {
        expect(tree.run((c) => undo(c, number))).toEqual(refused("missing", { id: gone[i] }));
      }
    }));

  it("of a union is refused while a child is of it", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => addUnion(c, "u", "ada", "eve"));
      tree.do((c) => addParent(c, "kid", "ada", { union: union("u") }));
      expect(tree.run((c) => undo(c, 2))).toEqual(refused("in-use"));
    }));

  it("minds no word a family writes", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "put-name",
            person: person("ada"),
            name: form("n1", { given: "The entry was erased by fire" }),
          }),
        ),
      );
      accepted(tree.run((c) => undo(c, 3)));
      accepted(tree.run((c) => undo(c, 2)));
    }));

  it("of a part of somebody who is gone is refused", () =>
    inTree((tree) => {
      family(tree);
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "remove-name", person: person("kid"), id: "n1" })),
      );
      tree.do((c) => accepted(c.kinship.apply({ do: "remove-person", id: person("kid") })));
      expect(tree.run((c) => undo(c, 2))).toEqual(
        refused("changed-since", { path: "names/n1", by: 3 }),
      );
    }));

  it("of an entry that is not there is refused", () =>
    inTree((tree) => {
      family(tree);
      expect(tree.run((c) => undo(c, 7))).toEqual(refused("missing"));
    }));
});

describe("a return to a version", () => {
  it("is an entry of its own, writes only what differs, and can be undone", () =>
    inTree((tree) => {
      tree.do((c) => {
        for (const who of ["ada", "eve", "kid"]) addPerson(c, who);
      });
      const first = stateOf(tree);
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      tree.do((c) => addParent(c, "kid", "ada"));
      const second = stateOf(tree);
      const result = accepted(tree.run((c) => restoreTo(c, 1)));
      expect(result.changed.map(({ aggregate }) => aggregate).sort()).toEqual(
        [`person/${person("ada")}`, `person/${person("kid")}`].sort(),
      );
      expect(head(tree)).toBe(4);
      expect(stateOf(tree)).toEqual(first);
      expect(tree.read((c) => c.kinship.get(person("ada"))?.children)).toEqual([]);
      accepted(tree.run((c) => restoreTo(c, 3)));
      expect(stateOf(tree)).toEqual(second);
      accepted(tree.run((c) => undo(c, 5)));
      expect(stateOf(tree)).toEqual(first);
    }));

  it("to where it is already changes nothing, and to nowhere is refused", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "unknown" }))));
      const rows = tree.rows();
      expect(tree.run((c) => restoreTo(c, 3))).toEqual(refused("nothing-to-restore"));
      expect(tree.run((c) => restoreTo(c, 1))).toEqual(refused("nothing-to-restore"));
      for (const number of [4, -1, 1.5, Number.NaN]) {
        expect(tree.run((c) => restoreTo(c, number))).toEqual(refused("missing"));
      }
      expect(tree.rows()).toEqual(rows);
      accepted(tree.run((c) => restoreTo(c, 0)));
      expect(stateOf(tree)).toEqual({});
    }));

  it("goes back before a start over, which is an entry too", () =>
    inTree((tree) => {
      tree.do((c) => {
        for (const who of ["ada", "eve"]) addPerson(c, who);
        addBranch(c, "green");
        addUnion(c, "u", "ada", "eve");
        addParent(c, "eve", "ada");
        accepted(c.life.add(wedding()));
        accepted(
          c.places.add({ id: place("town"), names: [], affiliations: [], coordinates: null }),
        );
      });
      const before = stateOf(tree);
      accepted(tree.run((c) => startOver(c)));
      expect(stateOf(tree)).toEqual({});
      expect(tree.rows()).toMatchObject({
        kinship_person: [],
        life_subject: [],
        kinship_union: [],
      });
      expect(head(tree)).toBe(2);
      accepted(tree.run((c) => restoreTo(c, 1)));
      expect(stateOf(tree)).toEqual(before);
      accepted(tree.run((c) => undo(c, 3)));
      expect(stateOf(tree)).toEqual({});
      expect(tree.run((c) => startOver(c))).toEqual(refused("nothing-to-restore"));
    }));
});

describe("after any steps", () => {
  const steps = fc.array(someStep, { minLength: 10, maxLength: 40, size: "max" });

  it(
    "every version is what it was, by the journal and by a return to it",
    () =>
      fc.assert(
        fc.asyncProperty(steps, fc.double({ min: 0, max: 0.999, noNaN: true }), (list, share) =>
          inTree((tree) => {
            const states: State[] = [{}];
            for (const step of list) {
              take(tree, step);
              if (head(tree) === states.length) states.push(stateOf(tree));
            }
            const last = head(tree);
            const now = stateOf(tree);
            const entries = tree.read((c) => c.history.entries({ limit: 100 }));
            expect(entries.map(({ number }) => number)).toEqual(
              Array.from({ length: last }, (_, i) => last - i),
            );
            for (let n = 0; n <= last; n++) {
              expect(reverse(now, entries.slice(0, last - n))).toEqual(states[n]);
            }
            const back = Math.floor(share * (last + 1));
            const returned = tree.run((c) => restoreTo(c, back));
            if (!returned.ok) {
              expect(returned).toEqual(refused("nothing-to-restore"));
              expect(states[back]).toEqual(now);
              return;
            }
            expect(stateOf(tree)).toEqual(states[back]);
            expect(tree.run((c) => restoreTo(c, last)).ok).toBe(true);
            expect(stateOf(tree)).toEqual(now);
            // Mirrors followed: the same commands as on a tree made anew are accepted.
            tree.read((c) => {
              for (const who of people) {
                const one = c.kinship.get(person(who));
                if (one === null) continue;
                const children = people
                  .map(person)
                  .filter((id) => c.kinship.get(id)?.parents.some((p) => p.parent === one.id));
                expect([...one.children].sort()).toEqual(children.sort());
                for (const id of one.unions) {
                  expect(c.kinship.union(id)?.partners).toContain(one.id);
                }
              }
            });
          }),
        ),
        { numRuns: 100 },
      ),
    60_000,
  );
});

describe("after any steps and an erasure", () => {
  const steps = fc.array(someStep, { minLength: 10, maxLength: 40, size: "max" });

  it(
    "no row and no version knows the erased, and every version can be returned to",
    () =>
      fc.assert(
        fc.asyncProperty(steps, anyone, steps, (list, who, more) =>
          inTree(async (tree) => {
            for (const step of list) take(tree, step);
            const ledger = { remember: () => {}, all: () => [] };
            let made = 0;
            const newId = () => event(`new ${(made += 1)}`);
            const id = person(who);
            const gone = await eraseForever(ledger, tree.work, { actor: anna, now: 5 }, id, newId);
            expect(gone.ok).toBe(true);
            const isSaid = () => JSON.stringify(tree.rows()).includes(id);
            expect(isSaid()).toBe(false);
            for (const step of more) if (!("who" in step) || step.who !== who) take(tree, step);
            const last = head(tree);
            const all = versionsOf(tree.storage, tree.work);
            for (let number = 0; number <= last; number += 3) {
              const state = JSON.stringify(await all.at(number));
              expect(state.includes(id) || state.includes('"erased"')).toBe(false);
              const result = tree.run((c) => restoreTo(c, number));
              if (!result.ok) expect(result).toEqual(refused("nothing-to-restore"));
            }
            const others = JSON.stringify({ ...tree.rows(), other: 0 });
            if (!more.some((step) => "other" in step && step.other === who)) {
              expect(others.includes(id)).toBe(false);
            }
          }),
        ),
        { numRuns: 100 },
      ),
    60_000,
  );
});

describe("versions", () => {
  const act = { actor: anna, now: 7, scenario: "test" };
  const versions = (tree: Tree) => versionsOf(tree.counted, tree.work);

  it("are told from the last one, with their names, page by page", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      for (const sex of ["female", "male", "other"]) {
        tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex }))), act);
      }
      const all = versions(tree);
      expect(all.name(2, "До импорта")).toEqual({ ok: true, value: 2 });
      expect(all.name(9, "нет")).toEqual(refused("missing"));
      const page = all.entries({ limit: 2 });
      expect(page.map(({ number, title }) => [number, title])).toEqual([
        [4, null],
        [3, null],
      ]);
      expect(page[0]).toMatchObject({ at: 7, by: anna, scenario: "test" });
      const next = all.entries({ before: 3, limit: 2 });
      expect(next.map(({ number, title }) => [number, title])).toEqual([
        [2, "До импорта"],
        [1, null],
      ]);
      all.name(2, "");
      expect(all.entries({ before: 3, limit: 1 })[0]?.title).toBeNull();
      expect(tree.entries).toBe(4);
    }));

  it("can be looked at, with checkpoints and without", () =>
    inTree(async (tree) => {
      const all = versions(tree);
      tree.do((c) => addPerson(c, "ada"));
      const states: State[] = [{}, stateOf(tree)];
      for (let i = 0; i < 12; i++) {
        tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: i % 2 ? "male" : "female" }))));
        states.push(stateOf(tree));
        if (i % 4 === 3) await all.checkpoint();
      }
      expect(tree.rows().history_checkpoint).toHaveLength(3);
      for (const [number, state] of states.entries()) {
        expect(await all.at(number), String(number)).toEqual(state);
      }
      expect(await all.at(99)).toBeNull();
      tree.storage.sql.exec("DELETE FROM history_checkpoint");
      for (const [number, state] of states.entries()) {
        expect(await all.at(number), String(number)).toEqual(state);
      }
    }));

  it("do without a checkpoint that cannot be read, and tell nothing of what is in it", () =>
    inTree(async (tree) => {
      const all = versions(tree);
      tree.do((c) => addPerson(c, "ada"));
      const state = stateOf(tree);
      await all.checkpoint();
      tree.storage.sql.exec("UPDATE history_checkpoint SET data = ?", new Uint8Array([1, 2, 3]));
      expect(await all.at(1)).toEqual(state);
    }));

  it("start from the next checkpoint, so old ones need few entries", () =>
    inTree(async (tree) => {
      const all = versions(tree);
      tree.do((c) => addPerson(c, "ada"));
      for (let i = 0; i < 30; i++) {
        tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: i % 2 ? "male" : "female" }))));
        if (i === 2 || i === 25) await all.checkpoint();
      }
      const { read } = await tree.countAsync(() => all.at(2));
      // The checkpoint, the epoch twice and the entries after it.
      expect(read).toBeLessThan(12);
    }));

  it("get no checkpoint of somebody who was erased while it was made", () =>
    inTree(async (tree) => {
      const all = versions(tree);
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => addPerson(c, "eve"));
      const making = all.checkpoint();
      const gone = eraseHere(tree.work, { actor: anna, now: 5 }, person("ada"), () => event("x"));
      expect(gone.ok).toBe(true);
      await making;
      expect(tree.rows().history_checkpoint).toEqual([]);
      await all.checkpoint();
      expect(tree.rows().history_checkpoint).toHaveLength(1);
      expect(await all.at(head(tree))).toEqual(stateOf(tree));
    }));

  it("are not looked at with somebody erased while a checkpoint was read", () =>
    inTree(async (tree) => {
      const all = versions(tree);
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => addPerson(c, "eve"));
      await all.checkpoint();
      const looking = all.at(2);
      eraseHere(tree.work, { actor: anna, now: 5 }, person("ada"), () => event("x"));
      expect(JSON.stringify(await looking)).not.toContain(person("ada"));
    }));

  it("get a checkpoint every 500 entries, and not more than are needed for speed", () =>
    inTree(async (tree) => {
      const all = versions(tree);
      expect(all.isCheckpointDue()).toBe(false);
      tree.do((c) => addPerson(c, "ada"));
      const fill = (count: number) => {
        const entry = JSON.stringify({ at: 1, by: anna, scenario: "s", patches: [] });
        const last = head(tree);
        for (let i = 1; i <= count; i++) {
          tree.storage.sql.exec(
            "INSERT INTO history_entry (number, part, data) VALUES (?, 0, ?)",
            last + i,
            entry,
          );
        }
      };
      fill(498);
      expect(all.isCheckpointDue()).toBe(false);
      fill(1);
      expect(all.isCheckpointDue()).toBe(true);
      await all.checkpoint();
      expect(all.isCheckpointDue()).toBe(false);
      for (let i = 0; i < 30; i++) {
        fill(1);
        await all.checkpoint();
      }
      expect(tree.rows().history_checkpoint?.length).toBeLessThanOrEqual(20);
      expect(await all.at(1)).toEqual(stateOf(tree));
    }));

  it("have an epoch, which a rollback replaces", () =>
    inTree((tree) => {
      const all = versions(tree);
      const first = all.epoch();
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(all.epoch()).toBe(first);
      all.renewEpoch("another");
      expect(all.epoch()).toBe("another");
    }));
});

describe("an entry of hundreds of aggregates", () => {
  it("is found by each of them, and writes no row for each", () =>
    inTree((tree) => {
      tree.do((c) => {
        for (let i = 0; i < 150; i++) addPerson(c, `p ${i}`);
      });
      expect(tree.rows().history_subject).toEqual([]);
      tree.do((c) => accepted(c.kinship.apply(edit("p 7", { sex: "female" }))));
      tree.read((c) => {
        expect(c.history.entriesOf(person("p 7"))).toEqual([1, 2]);
        expect(c.history.entriesOf(person("p 8"))).toEqual([1]);
        expect(c.history.entriesOf(person("nobody"))).toEqual([]);
      });
    }));
});
