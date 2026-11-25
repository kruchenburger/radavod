import { describe, expect, it } from "vitest";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { State } from "../../src/shared/reverse";
import { snapshotOf, touchedBy, yearOf } from "../../src/shared/snapshot";
import { treeSnapshotSchema } from "../../src/shared/tree";

const head = { version: 7, epoch: "e1" };

const name = (id: string, given: string, surname = "") => ({
  id,
  language: "ru",
  script: "Cyrl",
  kind: "birth",
  given,
  patronymic: "",
  surname,
  certainty: "hypothesis",
});

const somebody = (fields: object = {}) => ({
  sex: "female",
  living: "no",
  names: [name("n1", "Ада", "Дуб"), name("n2", "Ida")],
  mainName: "n2",
  parents: [],
  childOrder: [],
  ...fields,
});

const event = (id: string, fields: object) => ({
  id,
  kind: "birth",
  title: "",
  date: null,
  place: null,
  participants: [{ person: "ada", role: "principal" }],
  union: null,
  main: true,
  certainty: "hypothesis",
  note: "",
  ...fields,
});

const state: State = {
  "person/ada": somebody({
    parents: [
      {
        id: "l1",
        parent: "bob",
        union: "u1",
        kind: "blood",
        main: true,
        certainty: "confirmed",
      },
      {
        id: "l2",
        parent: "unknown",
        union: null,
        kind: "adoption",
        main: false,
        certainty: "hypothesis",
      },
    ],
    childOrder: ["cy", "di"],
  }),
  "person/bob": somebody({ sex: "male", names: [], mainName: null }),
  "person-branch/ada": "b1",
  "union/u1": { partners: ["bob", "unknown"], kind: "marriage", certainty: "one-source" },
  "union/u2": { partners: ["bob", "ada"], kind: "civil", certainty: "hypothesis" },
  "union-branch/u2": "b1",
  "branch/b1": { title: { ru: "Дубы", en: "Oaks" }, color: 11 },
  "place/p1": {
    names: [{ text: "Вильня", language: "ru", period: null }],
    affiliations: [],
    coordinates: null,
  },
  "life/ada": {
    events: [
      event("e0", { date: parseFuzzyDate("1880"), main: false }),
      event("e1", { date: parseFuzzyDate("около 1885"), place: null }),
      event("e2", { kind: "death", date: parseFuzzyDate("в голодный год"), place: "p1" }),
    ],
  },
  "life/bob": {
    events: [
      event("w1", { kind: "wedding", union: "u1", date: parseFuzzyDate("1910") }),
      event("w2", { kind: "wedding", union: "u1", date: parseFuzzyDate("1905") }),
      event("w3", { kind: "wedding", union: "u2", date: parseFuzzyDate("до 1900") }),
    ],
  },
  "source/s1": { kind: "book", title: "", repository: "", note: "" },
  "cited/ada": { citations: [] },
};

describe("a snapshot of a state", () => {
  const snapshot = snapshotOf(state, head);
  const ada = snapshot.people.find(({ id }) => id === "ada");
  const bob = snapshot.people.find(({ id }) => id === "bob");

  it("is what the contract says, with its version and epoch", () => {
    expect(treeSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot).toMatchObject({ format: 1, version: 7, epoch: "e1" });
  });

  it("shows the main name, keeps the others, and a part nobody wrote is null", () => {
    expect(ada?.name).toMatchObject({ given: "Ida", surname: null, patronymic: null });
    expect(ada?.otherNames.map(({ given, surname }) => [given, surname])).toEqual([["Ада", "Дуб"]]);
    expect(bob?.name).toBeNull();
  });

  it("has every parentage, an unknown parent as null, and the order of children", () => {
    expect(ada?.parents).toEqual([
      { id: "l1", parent: "bob", union: "u1", kind: "blood", main: true, certainty: "confirmed" },
      {
        id: "l2",
        parent: null,
        union: null,
        kind: "adoption",
        main: false,
        certainty: "hypothesis",
      },
    ]);
    expect(ada?.childOrder).toEqual(["cy", "di"]);
    expect(bob?.childOrder).toEqual([]);
  });

  it("gives the branch of a person and of a couple", () => {
    expect([ada?.branch, bob?.branch]).toEqual(["b1", null]);
    expect(snapshot.unions.map(({ id, branch }) => [id, branch])).toEqual([
      ["u1", null],
      ["u2", "b1"],
    ]);
    expect(snapshot.branches).toEqual([{ id: "b1", title: { ru: "Дубы", en: "Oaks" }, color: 11 }]);
  });

  it("shows the main birth and death, and the place of the birth, else of the death", () => {
    expect(ada?.birth).toEqual(yearOf(parseFuzzyDate("около 1885")));
    expect(ada?.death).toEqual({ text: "в голодный год", qualifier: "unread", sort: null });
    expect(ada?.place).toBe("p1");
    expect([bob?.birth, bob?.death, bob?.place]).toEqual([null, null, null]);
  });

  it("dates a union by its earliest wedding, a partner nobody knows is null", () => {
    const [u1, u2] = snapshot.unions;
    expect(u1).toMatchObject({
      partners: ["bob", null],
      kind: "marriage",
      certainty: "one-source",
    });
    expect(u1?.began).toBe(yearOf(parseFuzzyDate("1905")).sort);
    // A wedding only known to be before a year has no earliest day.
    expect(u2?.began).toBeNull();
  });

  it("names the places, and carries no events, sources or citations", () => {
    expect(snapshot.places).toEqual([{ id: "p1", names: [{ text: "Вильня", language: "ru" }] }]);
    expect(Object.keys(snapshot).sort()).toEqual(
      ["branches", "epoch", "format", "people", "places", "unions", "version"].sort(),
    );
  });

  it("refuses a state that is not what was written", () => {
    expect(() => snapshotOf({ "person/ada": { sex: "female" } }, head)).toThrow(
      "corrupt-state person/ada",
    );
  });
});

describe("a year", () => {
  it("is shown in digits, a range with a dash", () => {
    expect(yearOf(parseFuzzyDate("1885"))).toMatchObject({ text: "1885", qualifier: "exact" });
    expect(yearOf(parseFuzzyDate("между 1885 и 1890"))).toMatchObject({
      text: "1885–1890",
      qualifier: "between",
    });
    expect(yearOf(parseFuzzyDate("до 1903")).sort).toBeNull();
  });
});

describe("what patches touch", () => {
  const none = () => null;
  const patch = (aggregate: string, path = "", before: unknown = null, after: unknown = null) => ({
    aggregate,
    path,
    before,
    after,
  });

  it("is the person, union, branch or place of the snapshot", () => {
    expect(
      touchedBy(
        [
          patch("person/a", "sex"),
          patch("person-branch/b"),
          patch("union-branch/u"),
          patch("branch/b1", "color"),
          patch("place/p", "names/x/text"),
          patch("cited/a", "citations/c1"),
          patch("source/s"),
          patch("trash/t"),
        ],
        none,
      ).sort(),
    ).toEqual(["branch/b1", "person/a", "person/b", "place/p", "union/u"]);
  });

  it("names the unions a change of events dates", () => {
    const wedding = event("w", { kind: "wedding", union: "u1" });
    const unionOf = (home: string, id: string) => (home === "bob" && id === "w" ? "u4" : null);
    expect(touchedBy([patch("life/bob", "events/w", null, wedding)], unionOf).sort()).toEqual([
      "person/bob",
      "union/u1",
      "union/u4",
    ]);
    expect(touchedBy([patch("life/bob", "events/w/date")], unionOf).sort()).toEqual([
      "person/bob",
      "union/u4",
    ]);
    expect(touchedBy([patch("life/bob", "events/w/union", "u2", "u3")], unionOf).sort()).toEqual([
      "person/bob",
      "union/u2",
      "union/u3",
      "union/u4",
    ]);
    expect(touchedBy([patch("life/bob", "", { events: [wedding] }, null)], none).sort()).toEqual([
      "person/bob",
      "union/u1",
    ]);
    expect(touchedBy([patch("life/bob", "events/", ["w"], ["w", "x"])], none)).toEqual([
      "person/bob",
    ]);
  });
});
