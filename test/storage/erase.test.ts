import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { LifeEvent } from "../../src/contexts/life";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { EventId, PersonId } from "../../src/kernel/id";
import type { NameForm } from "../../src/kernel/name-form";
import { eraseForever, type Ledger, mentionsOf, reapplyErasures } from "../../src/scenarios/erase";
import { restoreTo } from "../../src/scenarios/restore-to";
import { restore, trash } from "../../src/scenarios/trash";
import { undo } from "../../src/scenarios/undo";
import { snapshotsOf } from "../../src/scenarios/snapshot";
import { versionsOf } from "../../src/scenarios/versions";
import { sqliteLedger } from "../../src/contexts/access";
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
  idOf,
  inTree,
  parentage,
  person,
  source,
  type Tree,
  union,
} from "./tree";

const act = { actor: anna, now: 9 };
let made = 0;
const newId = (): EventId => event(`new ${(made += 1)}`);

/** A ledger in memory, as the other object would answer. */
function ledgerOf(...ids: PersonId[]): Ledger & { ids: PersonId[] } {
  return {
    ids,
    remember: (more) => {
      ids.push(...more);
    },
    all: () => ids,
  };
}

const erase = (tree: Tree, who: string, ledger: Ledger = ledgerOf()) =>
  eraseForever(ledger, tree.work, act, person(who), newId);

const names: NameForm[] = [
  form("n1", { given: "Нимфадора", patronymic: "Гурьевна", surname: "Заозёрная" }),
  form("n2", { given: "Nimfadora", surname: "Zaozierna", language: "pl", script: "Latn" }),
  form("n3", { given: "Хромуша", kind: "nickname" }),
];
const said = [
  "Нимфадора",
  "Гурьевна",
  "Заозёрная",
  "Nimfadora",
  "Zaozierna",
  "Хромуша",
  person("ada"),
];

const told = (name: string, kind: LifeEvent["kind"], ...who: [string, string][]): LifeEvent => ({
  id: event(name),
  kind,
  title: "",
  date: parseFuzzyDate("1885"),
  place: null,
  participants: who.map(([one, role]) => ({ person: person(one), role })),
  union: null,
  main: true,
  certainty: "hypothesis",
  note: "",
});

/** A family with a long history of Ada, who goes to the trash and comes back. */
function family(tree: Tree): void {
  tree.do((c) => {
    for (const who of ["ada", "mother", "eve", "kid", "son", "guest"]) addPerson(c, who);
    addBranch(c, "green");
    addUnion(c, "u", "ada", "eve");
    addParent(c, "ada", "mother");
    addParent(c, "kid", "ada", { union: union("u") });
    addParent(c, "son", "ada");
  });
  for (const name of names) {
    tree.do((c) => accepted(c.kinship.apply({ do: "put-name", person: person("ada"), name })));
  }
  tree.do((c) =>
    accepted(
      c.kinship.apply({
        do: "assign-branch",
        person: person("ada"),
        branch: branch("green"),
        descendants: true,
        overwrite: false,
      }),
    ),
  );
  tree.do((c) =>
    accepted(
      c.evidence.addSource({
        id: source("book"),
        kind: "story",
        title: "Рассказ",
        repository: "",
        note: "",
      }),
    ),
  );
  tree.do((c) => {
    accepted(c.life.add(told("birth", "birth", ["ada", "principal"], ["mother", "mother"])));
    accepted(c.life.add(told("wedding", "wedding", ["ada", "principal"], ["eve", "principal"])));
    accepted(c.life.add(told("move", "emigration", ["ada", "principal"], ["kid", "principal"])));
    accepted(c.life.add(told("baptism", "baptism", ["guest", "principal"], ["ada", "godparent"])));
    for (const [id, fact] of [
      ["c1", "name:n1"],
      ["c2", `event:${event("wedding")}`],
      ["c3", `event:${event("birth")}`],
    ] as const) {
      accepted(
        c.evidence.cite({
          id: citation(id),
          source: source("book"),
          fact: { subject: person("ada"), fact },
          page: id,
          quote: "",
        }),
      );
    }
  });
  tree.do((c) =>
    accepted(
      c.kinship.apply({
        do: "order-children",
        person: person("mother"),
        order: [person("ada")],
      }),
    ),
  );
  accepted(tree.run((c) => trash(c, person("ada"), act)));
  accepted(tree.run((c) => restore(c, person("ada"))));
  tree.do((c) =>
    accepted(c.kinship.apply({ do: "remove-parent", child: person("son"), id: "ada" })),
  );
}

/** Where a text lies in any row of any table. */
function found(rows: Record<string, unknown[]>, texts: readonly string[]): string[] {
  return Object.entries(rows).flatMap(([table, list]) =>
    list.flatMap((row) => {
      const raw = JSON.stringify(row);
      return texts.filter((text) => raw.includes(text)).map((text) => `${table}: ${text}`);
    }),
  );
}

describe("an erased person", () => {
  it("is in no row of the tree: rows, journal, trash, checkpoints, snapshot, names of versions", () =>
    inTree(async (tree) => {
      family(tree);
      const all = versionsOf(tree.storage, tree.work);
      await all.checkpoint();
      all.name(3, "Как нашли Заозёрная Нимфадора Гурьевна");
      // Others speak of her: in the journal that goes too.
      const note = "Со слов Нимфадора Заозёрная, 1901";
      tree.do((c) =>
        accepted(
          c.life.edit(person("guest"), {
            ...told("baptism", "baptism", ["guest", "principal"], ["ada", "godparent"]),
            note,
          }),
        ),
      );
      tree.do((c) =>
        accepted(
          c.life.edit(person("guest"), {
            ...told("baptism", "baptism", ["guest", "principal"], ["ada", "godparent"]),
            note: "",
          }),
        ),
      );
      // The snapshot is packed: its rows go whole.
      await snapshotsOf(tree.storage, tree.work).snapshot();
      expect(tree.rows().history_snapshot).toHaveLength(1);
      expect(found(tree.rows(), said).length).toBeGreaterThan(20);
      const done = accepted(await erase(tree, "ada"));
      expect(done.mentions).toEqual([]);
      expect(found(tree.rows(), said)).toEqual([]);
      expect(tree.rows().history_checkpoint).toEqual([]);
      expect(tree.rows().history_snapshot).toEqual([]);
      // Her entries are there, with nobody in them.
      expect(tree.read((c) => c.history.entry(2))).toMatchObject({ scenario: "test", patches: [] });
      expect(all.entries({ before: 4, limit: 1 })[0]?.title).toBe("Как нашли [erased]");
    }));

  it("is in no row from the trash either, nor in the trash of others", () =>
    inTree(async (tree) => {
      family(tree);
      accepted(tree.run((c) => trash(c, person("ada"), act)));
      for (const who of ["eve", "kid", "mother", "guest"]) {
        accepted(tree.run((c) => trash(c, person(who), act)));
      }
      accepted(await erase(tree, "ada"));
      expect(found(tree.rows(), said)).toEqual([]);
      for (const who of ["eve", "kid", "mother", "guest"]) {
        const { value } = accepted(tree.run((c) => restore(c, person(who))));
        expect(value).toMatchObject({ dropped: [] });
      }
      tree.read((c) => {
        expect(c.kinship.get(person("kid"))?.parents).toEqual([]);
        expect(c.kinship.get(person("eve"))?.unions).toEqual([]);
      });
    }));

  it("leaves what is also about somebody else with them, and its citations", () =>
    inTree(async (tree) => {
      family(tree);
      accepted(await erase(tree, "ada"));
      tree.read((c) => {
        const [wedding] = c.life.eventsOf(person("eve"));
        expect(wedding).toMatchObject({
          kind: "wedding",
          participants: [{ person: person("eve"), role: "principal" }],
        });
        expect(wedding?.id).not.toBe(event("wedding"));
        expect(c.evidence.citationsOf(person("eve"))).toMatchObject([
          {
            id: citation("c2"),
            page: "c2",
            fact: { subject: person("eve"), fact: `event:${wedding?.id}` },
          },
        ]);
        expect(c.life.eventsOf(person("kid"))).toMatchObject([{ kind: "emigration" }]);
        // A birth was hers alone.
        expect(c.life.eventsOf(person("mother"))).toEqual([]);
        expect(c.life.eventsOf(person("guest"))[0]?.participants).toHaveLength(1);
        expect(c.kinship.get(person("kid"))?.parents).toEqual([]);
        expect(c.kinship.get(person("eve"))).toMatchObject({ unions: [], children: [] });
      });
    }));

  it("leaves a wedding with the other, whatever their role, and in the trash too", () =>
    inTree(async (tree) => {
      family(tree);
      tree.do((c) => {
        accepted(
          c.life.add(told("church", "divorce", ["ada", "principal"], ["eve", "бывший муж"])),
        );
        accepted(
          c.evidence.cite({
            id: citation("c7"),
            source: source("book"),
            fact: { subject: person("ada"), fact: `event:${event("church")}` },
            page: "7",
            quote: "",
          }),
        );
      });
      accepted(tree.run((c) => trash(c, person("eve"), act)));
      accepted(await erase(tree, "ada"));
      accepted(tree.run((c) => restore(c, person("eve"))));
      tree.read((c) => {
        const events = c.life.eventsOf(person("eve"));
        expect(events.map(({ kind }) => kind).sort()).toEqual(["divorce", "wedding"]);
        const cited = c.evidence.citationsOf(person("eve"));
        expect(cited.map(({ page }) => page).sort()).toEqual(["7", "c2"]);
        for (const { fact } of cited) {
          expect(events.map(({ id }) => `event:${id}`)).toContain(fact.fact);
        }
      });
    }));

  it("comes back by no version, no undo and no return", () =>
    inTree(async (tree) => {
      family(tree);
      const last = tree.read((c) => c.history.last());
      accepted(await erase(tree, "ada"));
      const all = versionsOf(tree.storage, tree.work);
      for (let number = 0; number <= last + 1; number++) {
        const state = JSON.stringify(await all.at(number));
        expect(said.filter((text) => state.includes(text))).toEqual([]);
        expect(state).not.toContain('"erased"');
      }
      // A child had a parent there, and nobody can say whom.
      const past = (await all.at(1)) as Record<string, { parents: unknown[] }>;
      expect(past[`person/${person("kid")}`]?.parents).toMatchObject([
        { parent: "unknown", union: null },
      ]);
      // The erasure itself, what was only about her, and what tied others to her.
      for (const number of [last + 1, 2, 1]) {
        expect(tree.run((c) => undo(c, number))).toMatchObject({
          error: { code: "irreversible" },
        });
      }
      for (const number of [1, 5, last]) {
        accepted(tree.run((c) => restoreTo(c, number)));
        expect(found(tree.rows(), said)).toEqual([]);
        tree.read((c) => {
          expect(c.kinship.get(person("ada"))).toBeNull();
          expect(c.kinship.get(person("kid"))?.parents).toMatchObject([{ parent: "unknown" }]);
        });
      }
    }));

  it("leaves no identifier in a path of the journal, where a link of a child is named by her", () =>
    inTree(async (tree) => {
      const ada = person("ada");
      // As the app links a parent: the link is named by the parent, and by a number when taken.
      tree.do((c) => {
        for (const who of ["ada", "eve", "kid"]) addPerson(c, who);
        addUnion(c, "u", "ada", "eve");
        addParent(c, "kid", "ada", { id: ada, union: union("u") });
        addParent(c, "kid", "eve", { id: person("eve"), union: union("u") });
      });
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "add-parent",
            child: person("kid"),
            parentage: { ...parentage("ada"), id: `${ada}-2`, kind: "adoption", main: false },
          }),
        ),
      );
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "edit-parent",
            child: person("kid"),
            id: ada,
            patch: { certainty: "one-source" },
          }),
        ),
      );
      tree.do((c) => {
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "story",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("p"),
            source: source("book"),
            fact: { subject: person("kid"), fact: `parentage:${ada}` },
            page: "",
            quote: "",
          }),
        );
      });
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "remove-parent", child: person("kid"), id: `${ada}-2` })),
      );
      const last = tree.read((c) => c.history.last());
      await versionsOf(tree.storage, tree.work).checkpoint();
      await snapshotsOf(tree.storage, tree.work).snapshot();
      expect(found(tree.rows(), [ada]).length).toBeGreaterThan(0);
      accepted(await erase(tree, "ada"));
      // Of every row of the tree, none holds her identifier, in a value, a key or a path.
      expect(found(tree.rows(), [ada])).toEqual([]);
      const all = versionsOf(tree.storage, tree.work);
      for (let number = 0; number <= last + 1; number++) {
        const state = JSON.stringify(await all.at(number));
        expect(state).not.toContain(ada);
        expect(state).not.toContain('"erased"');
      }
      // The child had three links there: two to a parent nobody can name, told apart, and Eve.
      const past = (await all.at(last - 1)) as Record<
        string,
        { parents: Record<string, string>[] }
      >;
      const links = past[`person/${person("kid")}`]?.parents ?? [];
      expect(links.map(({ parent }) => parent).toSorted()).toEqual(
        [person("eve"), "unknown", "unknown"].toSorted(),
      );
      expect(new Set(links.map(({ id }) => id)).size).toBe(3);
      for (const number of [1, last - 1, last]) {
        accepted(tree.run((c) => restoreTo(c, number)));
        expect(found(tree.rows(), [ada])).toEqual([]);
        // A citation of a link to her does not come back with the past.
        const live = Object.entries(tree.rows()).filter(([table]) => !table.startsWith("history_"));
        expect(found(Object.fromEntries(live), ["[erased]", "erased"])).toEqual([]);
      }
    }));

  it("leaves a child two links to nobody known when both parents are erased", () =>
    inTree(async (tree) => {
      tree.do((c) => {
        for (const who of ["ada", "bob", "kid"]) addPerson(c, who);
      });
      tree.do((c) => addParent(c, "kid", "ada", { id: person("ada") }));
      tree.do((c) => addParent(c, "kid", "bob", { id: person("bob") }));
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "edit-parent",
            child: person("kid"),
            id: person("bob"),
            patch: { certainty: "one-source" },
          }),
        ),
      );
      const last = tree.read((c) => c.history.last());
      accepted(await erase(tree, "ada"));
      accepted(await erase(tree, "bob"));
      expect(found(tree.rows(), [person("ada"), person("bob")])).toEqual([]);
      const all = versionsOf(tree.storage, tree.work);
      const linksAt = async (number: number) =>
        ((await all.at(number)) as Record<string, { parents: Record<string, string>[] }>)[
          `person/${person("kid")}`
        ]?.parents ?? [];
      for (const [number, count] of [
        [last - 2, 1],
        [last - 1, 2],
        [last, 2],
      ] as const) {
        const links = await linksAt(number);
        expect(links.map(({ parent }) => parent)).toEqual(Array(count).fill("unknown"));
        expect(new Set(links.map(({ id }) => id)).size).toBe(count);
      }
      expect((await linksAt(last)).map(({ certainty }) => certainty).toSorted()).toEqual([
        "hypothesis",
        "one-source",
      ]);
      // An edit of a link to somebody erased cannot be told any more.
      expect(tree.run((c) => undo(c, last))).toMatchObject({ error: { code: "irreversible" } });
      accepted(tree.run((c) => restoreTo(c, last)));
      tree.read((c) => expect(c.kinship.get(person("kid"))?.parents).toHaveLength(2));
      expect(found(tree.rows(), [person("ada"), person("bob")])).toEqual([]);
    }));

  it("keeps the order of the links of a child in the past", () =>
    inTree(async (tree) => {
      tree.do((c) => {
        for (const who of ["ada", "bob", "kid"]) addPerson(c, who);
        addParent(c, "kid", "ada", { id: person("ada") });
        addParent(c, "kid", "bob", { id: person("bob") });
      });
      const before = tree.read((c) => c.history.last());
      // Her link is not the last one: the entry says the order too.
      accepted(tree.run((c) => trash(c, person("ada"), act)));
      accepted(await erase(tree, "ada"));
      const past = (await versionsOf(tree.storage, tree.work).at(before)) as Record<
        string,
        { parents: Record<string, string>[] }
      >;
      expect(past[`person/${person("kid")}`]?.parents.map(({ parent }) => parent)).toEqual([
        "unknown",
        person("bob"),
      ]);
      accepted(tree.run((c) => restoreTo(c, before)));
      tree.read((c) =>
        expect(c.kinship.get(person("kid"))?.parents.map(({ parent }) => parent)).toEqual([
          "unknown",
          person("bob"),
        ]),
      );
    }));

  it("leaves no citation of a link to her, whoever of the two was in the trash", async () => {
    // A child cites the link to her, as the app names a link: by the parent.
    const linked = (tree: Tree) => {
      const ada = person("ada");
      tree.do((c) => {
        for (const who of ["ada", "kid"]) addPerson(c, who);
        addParent(c, "kid", "ada", { id: ada });
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "story",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("p"),
            source: source("book"),
            fact: { subject: person("kid"), fact: `parentage:${ada}` },
            page: "",
            quote: "",
          }),
        );
      });
    };
    // A link taken back by an undo leaves its citation behind: that goes too.
    await inTree(async (tree) => {
      tree.do((c) => {
        for (const who of ["ada", "kid"]) addPerson(c, who);
      });
      tree.do((c) => addParent(c, "kid", "ada", { id: person("ada") }));
      const linkedAt = tree.read((c) => c.history.last());
      tree.do((c) => {
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "story",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({
            id: citation("p"),
            source: source("book"),
            fact: { subject: person("kid"), fact: `parentage:${person("ada")}` },
            page: "",
            quote: "",
          }),
        );
      });
      accepted(tree.run((c) => undo(c, linkedAt)));
      accepted(await erase(tree, "ada"));
      expect(found(tree.rows(), [person("ada")])).toEqual([]);
    });
    for (const first of ["ada", "kid"]) {
      await inTree(async (tree) => {
        linked(tree);
        accepted(tree.run((c) => trash(c, person(first), act)));
        accepted(await erase(tree, "ada"));
        if (first === "kid") accepted(tree.run((c) => restore(c, person("kid"))));
        expect(found(tree.rows(), [person("ada")])).toEqual([]);
        // The journal marks where she was; what lives in the tree has no mark of her.
        const live = Object.entries(tree.rows()).filter(([table]) => !table.startsWith("history_"));
        expect(found(Object.fromEntries(live), ["[erased]", '"erased"'])).toEqual([]);
        tree.read((c) => expect(c.evidence.citationsOf(person("kid"))).toEqual([]));
      });
    }
  });

  it("is told of where others still speak of them, for a person to decide", () =>
    inTree(async (tree) => {
      family(tree);
      tree.do((c) => {
        accepted(c.evidence.editSource(source("book"), { title: "Рассказ. Заозёрная Нимфадора" }));
        accepted(
          c.life.edit(person("guest"), {
            ...told("baptism", "baptism", ["guest", "principal"]),
            note: "Nimfadora Zaozierna",
          }),
        );
      });
      const spoken = [`life/${person("guest")}`, `source/${source("book")}`];
      expect(tree.read((c) => mentionsOf(c, person("ada"))).sort()).toEqual(spoken.sort());
      const { mentions } = accepted(await erase(tree, "ada"));
      expect(mentions.sort()).toEqual(spoken.sort());
      const { evidence_source, life_subject, ...rows } = tree.rows();
      expect(found(rows, said)).toEqual([]);
      expect(found({ evidence_source: evidence_source ?? [] }, said)).not.toEqual([]);
      expect(found({ life_subject: life_subject ?? [] }, [person("ada")])).toEqual([]);
    }));

  it("takes nothing of others who have the same given name or surname", () =>
    inTree(async (tree) => {
      family(tree);
      const same = form("n5", { given: "Нимфадора", surname: "Верес" });
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "put-name", person: person("eve"), name: same })),
      );
      tree.do((c) =>
        accepted(
          c.kinship.apply({
            do: "put-name",
            person: person("kid"),
            name: form("n6", { given: "Дуб", surname: "Заозёрная" }),
          }),
        ),
      );
      const last = tree.read((c) => c.history.last());
      accepted(await erase(tree, "ada"));
      tree.read((c) => {
        expect(c.kinship.get(person("eve"))?.names).toContainEqual(same);
        expect(JSON.stringify(c.history.entry(last))).toContain("Заозёрная");
        expect(JSON.stringify(c.history.entry(last - 1))).toContain("Нимфадора");
      });
    }));

  it("is found as a whole word, and not by a given name and a patronymic others have", () =>
    inTree(async (tree) => {
      family(tree);
      const note = "Нимфадора Заозёрнаяя, ЛжеНимфадора Заозёрная и Нимфадора Гурьевна Вереснева";
      const write = (text: string) =>
        tree.do((c) =>
          accepted(
            c.life.edit(person("guest"), {
              ...told("baptism", "baptism", ["guest", "principal"]),
              note: text,
            }),
          ),
        );
      write(note);
      write("«Заозёрная Нимфадора», сказала она. Нимфадора Гурьевна Заозёрная.");
      write("");
      const last = tree.read((c) => c.history.last());
      const { mentions } = accepted(await erase(tree, "ada"));
      expect(mentions).toEqual([]);
      const text = tree.read((c) => JSON.stringify(c.history.entry(last - 2)));
      expect(text).toContain(note);
      const after = tree.read((c) => JSON.stringify(c.history.entry(last)));
      expect(after).toContain("«[erased]», сказала она. [erased].");
    }));

  it("is known by every name they ever had whole, edited part by part", () =>
    inTree(async (tree) => {
      family(tree);
      const write = (text: string) =>
        tree.do((c) =>
          accepted(
            c.life.edit(person("guest"), {
              ...told("baptism", "baptism", ["guest", "principal"]),
              note: text,
            }),
          ),
        );
      write("Досифея Тростянка и Досифея Полынина, она же");
      const put = (given: string, surname: string) =>
        tree.do((c) =>
          accepted(
            c.kinship.apply({
              do: "put-name",
              person: person("ada"),
              name: form("n8", { given, surname }),
            }),
          ),
        );
      put("Пульхерия", "Тростянка");
      // The whole of this one stands in no patch.
      put("Досифея", "Тростянка");
      put("Досифея", "Полынина");
      put("Анисья", "Полынина");
      write("");
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "remove-name", person: person("ada"), id: "n8" })),
      );
      accepted(await erase(tree, "ada"));
      expect(found(tree.rows(), ["Досифея Тростянка", "Досифея Полынина"])).toEqual([]);
    }));

  it("is not named in what goes over to others, nor in its citations", () =>
    inTree(async (tree) => {
      family(tree);
      const whole = "Нимфадора Заозёрная";
      tree.do((c) => {
        const golden = told("golden", "wedding", ["ada", "principal"], ["eve", "principal"]);
        accepted(c.life.add({ ...golden, title: `Свадьба: ${whole}`, note: `${whole}, 1901` }));
        accepted(
          c.evidence.cite({
            id: citation("c9"),
            source: source("book"),
            fact: { subject: person("ada"), fact: `event:${event("golden")}` },
            page: whole,
            quote: `«${whole}»`,
          }),
        );
      });
      accepted(tree.run((c) => trash(c, person("kid"), act)));
      const { mentions } = accepted(await erase(tree, "ada"));
      expect(mentions).toEqual([]);
      expect(found(tree.rows(), said)).toEqual([]);
      tree.read((c) => {
        expect(c.life.eventsOf(person("eve")).map(({ note }) => note)).toContain("[erased], 1901");
        expect(c.evidence.citationsOf(person("eve")).map(({ quote }) => quote)).toContain(
          "«[erased]»",
        );
      });
    }));

  it("who went by an undo is in no row either", () =>
    inTree(async (tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => accepted(c.life.add(told("birth", "birth", ["ada", "principal"]))));
      tree.do((c) => accepted(c.life.remove(person("ada"), event("birth"))));
      const fact = { subject: person("ada"), fact: "name:n1" };
      tree.do((c) => {
        accepted(
          c.evidence.addSource({
            id: source("book"),
            kind: "book",
            title: "",
            repository: "",
            note: "",
          }),
        );
        accepted(
          c.evidence.cite({ id: citation("c"), source: source("book"), fact, page: "", quote: "" }),
        );
      });
      tree.do((c) => accepted(c.evidence.uncite(fact, citation("c"))));
      accepted(tree.run((c) => undo(c, 1)));
      accepted(await erase(tree, "ada"));
      expect(found(tree.rows(), [person("ada")])).toEqual([]);
    }));

  it("may have any signs in the name", () =>
    inTree(async (tree) => {
      family(tree);
      const odd = form("n9", { given: 'Анна-Мария (Нюра) "\\"', surname: "О'Верес-Дуб [1]" });
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "put-name", person: person("ada"), name: odd })),
      );
      tree.do((c) =>
        accepted(
          // An event that names nobody else, so only the name leads to its entry.
          c.life.add({
            ...told("letter", "other", ["guest", "principal"]),
            note: `${odd.given} ${odd.surname}`,
          }),
        ),
      );
      const { mentions } = accepted(await erase(tree, "ada"));
      expect(mentions).toEqual([`life/${person("guest")}`]);
      const { life_subject, ...rows } = tree.rows();
      expect(found(rows, ["Анна-Мария", "О'Верес-Дуб"])).toEqual([]);
      expect(life_subject).not.toEqual([]);
    }));

  it("leaves an event with whoever else it is about, though others of it are in the trash", () =>
    inTree(async (tree) => {
      family(tree);
      tree.do((c) =>
        accepted(
          c.life.add(
            told(
              "golden",
              "wedding",
              ["ada", "principal"],
              ["eve", "principal"],
              ["guest", "witness"],
            ),
          ),
        ),
      );
      for (const who of ["guest", "kid"]) accepted(tree.run((c) => trash(c, person(who), act)));
      accepted(await erase(tree, "ada"));
      for (const who of ["guest", "kid"]) accepted(tree.run((c) => restore(c, person(who))));
      tree.read((c) => {
        const golden = c.life.eventsOf(person("guest")).find((one) => one.kind === "wedding");
        expect(golden?.participants).toEqual([
          { person: person("eve"), role: "principal" },
          { person: person("guest"), role: "witness" },
        ]);
        expect(c.life.eventsOf(person("kid"))).toMatchObject([{ kind: "emigration" }]);
      });
    }));

  it("takes nothing of a namesake, whose whole name is theirs too", () =>
    inTree(async (tree) => {
      tree.do((c) => {
        for (const who of ["father", "son"]) addPerson(c, who);
        const named = (who: string, patronymic: string) =>
          accepted(
            c.kinship.apply({
              do: "put-name",
              person: person(who),
              name: form("n1", { given: "Иван", patronymic, surname: "Петров" }),
            }),
          );
        named("father", "Петрович");
        named("son", "Иванович");
      });
      const own = told("army", "service", ["son", "principal"]);
      tree.do((c) => accepted(c.life.add({ ...own, note: "Иван Петров служил в армии" })));
      const last = tree.read((c) => c.history.last());
      const { mentions } = accepted(await erase(tree, "father"));
      expect(mentions).toEqual([]);
      expect(tree.read((c) => JSON.stringify(c.history.entry(last)))).toContain(
        "Иван Петров служил в армии",
      );
      accepted(tree.run((c) => undo(c, last)));
    }));

  it("leaves an entry that spoke of them in words irreversible, and says so", () =>
    inTree(async (tree) => {
      family(tree);
      const own = told("baptism", "baptism", ["guest", "principal"], ["ada", "godparent"]);
      tree.do((c) =>
        accepted(c.life.edit(person("guest"), { ...own, note: "крёстная Нимфадора Заозёрная" })),
      );
      const last = tree.read((c) => c.history.last());
      tree.do((c) => accepted(c.life.edit(person("guest"), { ...own, note: "" })));
      accepted(await erase(tree, "ada"));
      expect(tree.run((c) => undo(c, last))).toMatchObject({ error: { code: "irreversible" } });
    }));

  it("is erased once: to repeat it is harmless", () =>
    inTree(async (tree) => {
      family(tree);
      const ledger = ledgerOf();
      accepted(await erase(tree, "ada", ledger));
      const rows = tree.rows();
      accepted(await erase(tree, "ada", ledger));
      expect(tree.rows()).toEqual(rows);
      accepted(await erase(tree, "nobody", ledger));
      expect(tree.rows()).toEqual(rows);
    }));

  it("is remembered first, so a crash in between is mended by a repeat", () =>
    inTree(async (tree) => {
      family(tree);
      const ledger = ledgerOf();
      const rows = tree.rows();
      const crash = () => {
        throw new Error("crash");
      };
      await expect(
        eraseForever(ledger, { ...tree.work, run: crash }, act, person("ada"), newId),
      ).rejects.toThrow("crash");
      expect(ledger.ids).toEqual([person("ada")]);
      expect(tree.rows()).toEqual(rows);
      await reapplyErasures(ledger, tree.work, act, newId);
      expect(found(tree.rows(), said)).toEqual([]);
      const forgetful: Ledger = {
        remember: () => Promise.reject(new Error("down")),
        all: () => [],
      };
      await expect(erase(tree, "eve", forgetful)).rejects.toThrow("down");
      expect(tree.read((c) => c.kinship.get(person("eve")))).not.toBeNull();
    }));

  it("is erased again after the tree was rolled back to a point in time", () =>
    inTree(async (tree) => {
      family(tree);
      const ledger = ledgerOf();
      accepted(await erase(tree, "ada", ledger));
      // The rollback: every row as it was before.
      await inTree(async (rolled) => {
        family(rolled);
        expect(found(rolled.rows(), said)).not.toEqual([]);
        await reapplyErasures(ledger, rolled.work, act, newId);
        expect(found(rolled.rows(), said)).toEqual([]);
        const rows = rolled.rows();
        await reapplyErasures(ledger, rolled.work, act, newId);
        expect(rolled.rows()).toEqual(rows);
      });
    }));
});

describe("the ledger of erasures", () => {
  it("lies with the members, whom no rollback of the tree touches, and holds identifiers only", async () => {
    const name = crypto.randomUUID();
    await inTree(async (tree) => {
      family(tree);
      // Each object asks with a stub of its own.
      const stub = env.ACCESS.getByName(name);
      // A member and an invitation are tied to her.
      const keeper = idOf("member", "ann");
      const key = (id: string) => ({ id, kind: "passkey" as const, label: "", publicKey: "k" });
      const now = Date.now();
      const first = { member: { id: keeper, name: "Ann" }, credential: key("a"), now, code: "c" };
      expect((await stub.setUp(first)).ok).toBe(true);
      for (const id of ["i1", "i2"]) {
        // The keeper calls whom the link is for by her name.
        const name = "Нимфадора Заозёрная";
        const input = {
          id,
          hash: id,
          role: "reader" as const,
          person: person("ada"),
          name,
          now,
          seed: 0,
        };
        expect((await stub.invite(keeper, input)).ok).toBe(true);
      }
      const joined = { hash: "i1", now, member: { id: idOf("member", "ada"), name: "A" } };
      expect((await stub.redeem({ ...joined, credential: key("b") })).ok).toBe(true);
      const there: Ledger = {
        remember: (ids) => stub.remember(ids),
        all: () => stub.erased(),
      };
      accepted(await erase(tree, "ada", there));
      accepted(await erase(tree, "ada", there));
      await reapplyErasures(there, tree.work, act, newId);
      expect(found(tree.rows(), said)).toEqual([]);
    });
    await runInDurableObject(env.ACCESS.getByName(name), (_, { storage }) => {
      const tables = storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB '_cf_*'",
        )
        .toArray();
      const rows = Object.fromEntries(
        tables.map(({ name }) => [name, storage.sql.exec(`SELECT * FROM ${name}`).toArray()]),
      );
      // Of all the rows of both objects, her identifier is in the ledger and nowhere else: the
      // member and the invitation tied to her are tied to nobody now, and the link forgot her name.
      expect(found(rows, said)).toEqual([`access_erased: ${person("ada")}`]);
    });
  });

  // A name the keeper wrote on a link is the link's until somebody joins by it; then it is the
  // member's own, as if they had written it, and an erasure takes it from the link only.
  it("leaves a member who joined without writing a name the name the link had", async () => {
    const name = crypto.randomUUID();
    const stub = env.ACCESS.getByName(name);
    const keeper = idOf("member", "ann");
    const key = (id: string) => ({ id, kind: "passkey" as const, label: "", publicKey: "k" });
    const now = Date.now();
    const first = { member: { id: keeper, name: "Ann" }, credential: key("a"), now, code: "c" };
    expect((await stub.setUp(first)).ok).toBe(true);
    const called = "Нимфадора Заозёрная";
    for (const id of ["i1", "i2"]) {
      const input = { id, hash: id, role: "reader" as const, person: person("ada"), now, seed: 0 };
      expect((await stub.invite(keeper, { ...input, name: called })).ok).toBe(true);
    }
    // She joins by the first link and writes nothing: the keeper's name is hers now.
    const ada = idOf("member", "ada");
    const joined = await stub.newcomer("i1", now, { id: ada });
    expect(joined).toMatchObject({ ok: true, value: { name: called } });
    expect(
      (await stub.redeem({ hash: "i1", now, member: { id: ada, name: "" }, credential: key("b") }))
        .ok,
    ).toBe(true);
    // A step of joining by the second link, begun before the erasure, carries the name it was begun
    // with until it is answered or runs over, in five minutes at most.
    const begun = await stub.newcomer("i2", now, { id: idOf("member", "eve") });
    if (!begun.ok) throw new Error("no newcomer");
    const step = { hash: "s", challenge: "c", purpose: "register" as const, invitation: "i2" };
    expect((await stub.openChallenge({ ...step, member: begun.value }, now)).ok).toBe(true);
    await stub.remember([person("ada")]);
    await runInDurableObject(stub, (_, { storage }) => {
      const json = (table: string) =>
        storage.sql
          .exec<{ data: string }>(`SELECT data FROM ${table}`)
          .toArray()
          .map(({ data }) => data);
      expect(found({ access_member: json("access_member") }, [called])).toEqual([
        `access_member: ${called}`,
      ]);
      expect(found({ access_invitation: json("access_invitation") }, [called])).toEqual([]);
      const steps = storage.sql
        .exec<{ data: string; expires_at: number }>("SELECT data, expires_at FROM access_challenge")
        .toArray();
      expect(found({ access_challenge: steps.map(({ data }) => data) }, [called])).toEqual([
        `access_challenge: ${called}`,
      ]);
      expect(steps.every(({ expires_at }) => expires_at <= now + 5 * 60_000)).toBe(true);
    });
  });

  it("takes identifiers of people only, each once", async () => {
    const stub = env.ACCESS.getByName(crypto.randomUUID());
    await runInDurableObject(stub, (_, { storage }) => {
      const ledger = sqliteLedger(storage.sql);
      ledger.remember([person("ada"), person("eve")]);
      ledger.remember([person("ada")]);
      expect(ledger.all().toSorted()).toEqual([person("ada"), person("eve")].toSorted());
      expect(() => ledger.remember(["ada" as PersonId])).toThrow("bad-write");
      storage.sql.exec("UPDATE access_erased SET id = 'Тайна' WHERE id = ?", person("eve"));
      expect(() => ledger.all()).toThrow(/^corrupt-row erased$/);
    });
  });
});
