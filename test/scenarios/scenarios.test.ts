import { describe, expect, it } from "vitest";
import { addRelative } from "../../src/scenarios/add-relative";
import { assignBranch } from "../../src/scenarios/assign-branch";
import { certaintyOf, citeFact, setCertainty, uncite } from "../../src/scenarios/certainty";
import { editPerson } from "../../src/scenarios/edit-person";
import { undo } from "../../src/scenarios/undo";
import { factOf } from "../../src/contexts/life";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { FactRef } from "../../src/kernel/id";
import {
  addRelativeInput,
  assignBranchInput,
  citeFactInput,
  editPersonInput,
  setCertaintyInput,
  unciteInput,
} from "../../src/shared/scenarios";
import {
  accepted,
  addBranch,
  addPerson,
  addUnion,
  branch,
  citation,
  event,
  form,
  inTree,
  person,
  source,
  type Tree,
  union,
} from "../storage/tree";

const newPerson = (name: string, more: object = {}) => ({
  id: person(name),
  sex: "unknown" as const,
  living: "unknown" as const,
  names: [form("n1", { given: name })],
  mainName: null,
  ...more,
});

const parentsOf = (tree: Tree, who: string) =>
  tree.read((c) => c.kinship.get(person(who))?.parents ?? []);

const book = { id: source("book"), kind: "book" as const, title: "", repository: "", note: "" };

describe("adding a relative", () => {
  it("gives a child added to a union both partners as main blood parents", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "bob");
        addUnion(c, "u", "ada", "bob");
      });
      const done = tree.run((c) =>
        addRelative(c, {
          of: person("ada"),
          as: "child",
          person: newPerson("kid"),
          union: union("u"),
        }),
      );
      expect(done.ok).toBe(true);
      const links = parentsOf(tree, "kid");
      expect(
        links.map(({ parent, union: of, kind, main, certainty }) => [
          parent,
          of,
          kind,
          main,
          certainty,
        ]),
      ).toEqual([
        [person("ada"), union("u"), "blood", true, "hypothesis"],
        [person("bob"), union("u"), "blood", true, "hypothesis"],
      ]);
      expect(tree.entries).toBe(2);
    }));

  it("leaves the second parent unknown when the child is of one person", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      accepted(
        tree.run((c) =>
          addRelative(c, { of: person("ada"), as: "child", person: newPerson("kid") }),
        ),
      );
      expect(parentsOf(tree, "kid").map(({ parent, union: of }) => [parent, of])).toEqual([
        [person("ada"), null],
      ]);
    }));

  it("adds an existing person, or a parent nobody knows, as a parent", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addPerson(c, "bob");
      });
      accepted(
        tree.run((c) =>
          addRelative(c, { of: person("ada"), as: "parent", person: { existing: person("bob") } }),
        ),
      );
      accepted(
        tree.run((c) => addRelative(c, { of: person("ada"), as: "parent", person: "unknown" })),
      );
      expect(parentsOf(tree, "ada").map(({ id, parent, main }) => [id, parent, main])).toEqual([
        [person("bob"), person("bob"), true],
        ["unknown", "unknown", true],
      ]);
    }));

  it("refuses a third main blood parent and a cycle, and keeps nothing of them", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      for (const name of ["bob", "eve"]) {
        accepted(
          tree.run((c) =>
            addRelative(c, { of: person("ada"), as: "parent", person: newPerson(name) }),
          ),
        );
      }
      const third = tree.run((c) =>
        addRelative(c, { of: person("ada"), as: "parent", person: newPerson("dan") }),
      );
      expect(third).toEqual({ ok: false, error: { code: "third-main-blood-parent" } });
      const cycle = tree.run((c) =>
        addRelative(c, { of: person("bob"), as: "parent", person: { existing: person("ada") } }),
      );
      expect(cycle.ok ? null : cycle.error.code).toBe("cycle");
      expect(tree.read((c) => c.kinship.get(person("dan")))).toBeNull();
    }));

  it("makes a union with a partner, known or not", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      accepted(
        tree.run((c) =>
          addRelative(c, {
            of: person("ada"),
            as: "partner",
            person: newPerson("bob"),
            union: union("u1"),
          }),
        ),
      );
      accepted(
        tree.run((c) =>
          addRelative(c, {
            of: person("ada"),
            as: "partner",
            person: "unknown",
            union: union("u2"),
          }),
        ),
      );
      const unions = tree.read((c) => [c.kinship.union(union("u1")), c.kinship.union(union("u2"))]);
      expect(unions.map((one) => one && [one.partners, one.kind, one.certainty])).toEqual([
        [[person("ada"), person("bob")], "unknown", "hypothesis"],
        [[person("ada"), "unknown"], "unknown", "hypothesis"],
      ]);
    }));

  it("does not let a new person be known from a source nobody cited", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      const sure = newPerson("bob", { names: [form("n1", { certainty: "confirmed" })] });
      const done = tree.run((c) =>
        addRelative(c, { of: person("ada"), as: "child", person: sure }),
      );
      expect(done).toEqual({ ok: false, error: { code: "citation-required" } });
    }));

  it("takes only what its schema says", () => {
    const input = { of: person("ada"), as: "child", person: newPerson("kid") };
    expect(addRelativeInput.parse(input)).toEqual(input);
    expect(addRelativeInput.safeParse({ ...input, extra: 1 }).success).toBe(false);
    expect(addRelativeInput.safeParse({ ...input, person: "unknown" }).success).toBe(false);
    expect(addRelativeInput.safeParse({ ...input, as: "partner" }).success).toBe(false);
    expect(addRelativeInput.safeParse({ ...input, of: "ada" }).success).toBe(false);
    const named = { ...input, person: { ...newPerson("kid"), names: [{ ...form("n1"), x: 1 }] } };
    expect(addRelativeInput.safeParse(named).success).toBe(false);
  });
});

describe("editing a person", () => {
  it("changes what the patch says", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      accepted(
        tree.run((c) =>
          editPerson(c, { id: person("ada"), patch: { sex: "female", living: "no" } }),
        ),
      );
      expect(tree.read((c) => c.kinship.get(person("ada")))).toMatchObject({
        sex: "female",
        living: "no",
      });
      expect(editPersonInput.safeParse({ id: person("ada"), patch: { names: [] } }).success).toBe(
        false,
      );
    }));
});

describe("certainty", () => {
  const name: FactRef = { subject: person("ada"), fact: "name:n1" };

  const withAda = (tree: Tree) =>
    tree.do((c) => {
      addPerson(c, "ada");
      accepted(c.evidence.addSource(book));
    });

  it("of one source or confirmed needs a citation", () =>
    inTree((tree) => {
      withAda(tree);
      for (const certainty of ["one-source", "confirmed"] as const) {
        expect(tree.run((c) => setCertainty(c, { fact: name, certainty }))).toEqual({
          ok: false,
          error: { code: "citation-required" },
        });
      }
      for (const certainty of ["contradiction", "unresolved", "hypothesis"] as const) {
        accepted(tree.run((c) => setCertainty(c, { fact: name, certainty })));
        expect(tree.read((c) => certaintyOf(c, name))).toBe(certainty);
      }
    }));

  it("is raised with the citation that stands behind it, in one entry", () =>
    inTree((tree) => {
      withAda(tree);
      const before = tree.entries;
      accepted(
        tree.run((c) =>
          citeFact(c, {
            fact: name,
            source: source("book"),
            citation: citation("c1"),
            page: "12",
            certainty: "confirmed",
          }),
        ),
      );
      expect(tree.entries).toBe(before + 1);
      expect(tree.read((c) => certaintyOf(c, name))).toBe("confirmed");
      expect(tree.read((c) => c.evidence.citationsOf(person("ada")))).toEqual([
        { id: citation("c1"), source: source("book"), fact: name, page: "12", quote: "" },
      ]);
    }));

  it("comes back to a hypothesis when the last citation goes, not before", () =>
    inTree((tree) => {
      withAda(tree);
      for (const id of ["c1", "c2"]) {
        accepted(
          tree.run((c) =>
            citeFact(c, {
              fact: name,
              source: source("book"),
              citation: citation(id),
              certainty: "one-source",
            }),
          ),
        );
      }
      accepted(tree.run((c) => uncite(c, { fact: name, citation: citation("c1") })));
      expect(tree.read((c) => certaintyOf(c, name))).toBe("one-source");
      accepted(tree.run((c) => uncite(c, { fact: name, citation: citation("c2") })));
      expect(tree.read((c) => certaintyOf(c, name))).toBe("hypothesis");
    }));

  it("comes back to a hypothesis when an undo takes the citation back", () =>
    inTree((tree) => {
      withAda(tree);
      accepted(
        tree.run((c) =>
          citeFact(c, { fact: name, source: source("book"), citation: citation("c1") }),
        ),
      );
      const cited = tree.read((c) => c.history.last());
      accepted(tree.run((c) => setCertainty(c, { fact: name, certainty: "confirmed" })));
      accepted(tree.run((c) => undo(c, cited)));
      expect(tree.read((c) => c.evidence.countFor(name))).toBe(0);
      expect(tree.read((c) => certaintyOf(c, name))).toBe("hypothesis");
    }));

  it("is of a parentage, a union and an event too, and a new source comes with its citation", () =>
    inTree((tree) => {
      withAda(tree);
      tree.do((c) => {
        addPerson(c, "bob");
        addUnion(c, "u", "ada", "bob");
        accepted(
          c.kinship.apply({
            do: "add-parent",
            child: person("bob"),
            parentage: {
              id: "p",
              parent: person("ada"),
              union: null,
              kind: "blood",
              main: true,
              certainty: "hypothesis",
            },
          }),
        );
        accepted(
          c.life.add({
            id: event("birth"),
            kind: "birth",
            title: "",
            date: parseFuzzyDate("1885"),
            place: null,
            participants: [{ person: person("bob"), role: "principal" }],
            union: null,
            main: true,
            certainty: "hypothesis",
            note: "",
          }),
        );
      });
      const born = tree.read((c) => c.life.event(person("bob"), event("birth")));
      if (born === null) throw new Error("no birth");
      const facts: FactRef[] = [
        { subject: person("bob"), fact: "parentage:p" },
        { subject: union("u"), fact: "union" },
        factOf(born),
      ];
      for (const [i, fact] of facts.entries()) {
        const fresh = { ...book, id: source(`new ${i}`) };
        accepted(
          tree.run((c) =>
            citeFact(c, {
              fact,
              source: fresh,
              citation: citation(`c${i}`),
              certainty: "confirmed",
            }),
          ),
        );
        expect(tree.read((c) => certaintyOf(c, fact))).toBe("confirmed");
        expect(tree.read((c) => c.evidence.source(fresh.id))).not.toBeNull();
      }
      expect(factOf(born)).toEqual({ subject: person("bob"), fact: `event:${event("birth")}` });
    }));

  it("is not given to a fact that is not there", () =>
    inTree((tree) => {
      withAda(tree);
      const nowhere: FactRef = { subject: person("ada"), fact: "name:n9" };
      const cited = tree.run((c) =>
        citeFact(c, { fact: nowhere, source: source("book"), citation: citation("c1") }),
      );
      expect(cited).toEqual({ ok: false, error: { code: "missing", id: "name:n9" } });
      expect(
        tree.run((c) =>
          setCertainty(c, {
            fact: { subject: person("ada"), fact: "dream" },
            certainty: "hypothesis",
          }),
        ),
      ).toEqual({
        ok: false,
        error: { code: "missing", id: "dream" },
      });
    }));

  it("takes only what the schemas say", () => {
    const fact = { subject: person("ada"), fact: "name:n1" };
    expect(setCertaintyInput.safeParse({ fact, certainty: "sure" }).success).toBe(false);
    expect(
      setCertaintyInput.safeParse({ fact: { ...fact, x: 1 }, certainty: "confirmed" }).success,
    ).toBe(false);
    expect(unciteInput.safeParse({ fact, citation: "c1" }).success).toBe(false);
    const cite = { fact, source: source("book"), citation: citation("c1") };
    expect(citeFactInput.parse(cite)).toEqual(cite);
    expect(citeFactInput.safeParse({ ...cite, source: { ...book, version: 1 } }).success).toBe(
      false,
    );
  });
});

describe("giving a branch", () => {
  it("gives it to the descendants as the kinship rules say", () =>
    inTree((tree) => {
      tree.do((c) => {
        addPerson(c, "ada");
        addBranch(c, "oak");
      });
      accepted(
        tree.run((c) =>
          addRelative(c, { of: person("ada"), as: "child", person: newPerson("kid") }),
        ),
      );
      const input = {
        person: person("ada"),
        branch: branch("oak"),
        descendants: true,
        overwrite: false,
      };
      expect(assignBranchInput.parse(input)).toEqual(input);
      accepted(tree.run((c) => assignBranch(c, input)));
      expect(
        tree.read((c) => [
          c.kinship.get(person("ada"))?.branch,
          c.kinship.get(person("kid"))?.branch,
        ]),
      ).toEqual([branch("oak"), branch("oak")]);
    }));
});
