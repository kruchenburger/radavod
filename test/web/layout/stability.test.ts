import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import type { TreePerson, TreeSnapshot } from "../../../src/shared/tree";
import { around } from "../../../web/tree/layout/around";
import { branchMap } from "../../../web/tree/layout/branch-map";
import { kinOf } from "../../../web/tree/layout/kin";
import { mapTracks, stability } from "../../../web/tree/layout/stability";
import { measure, personOf, wordingOf } from "./family";

const snapshot = snapshotOf(generateFamily(1, 300));
const draw = (from: TreeSnapshot) =>
  branchMap(from, { level: "closer", measure, headOf: ({ title }) => title.ru });

/** The people within so many steps of kinship. */
function near(from: TreeSnapshot, person: string, steps: number): Set<string> {
  const kin = kinOf(from);
  const found = new Set([person]);
  let front = [person];
  for (let i = 0; i < steps; i += 1) {
    front = front.flatMap((id) => [
      ...kin.sets(id).flatMap(({ known }) => known),
      ...kin.children(id).map(({ child }) => child),
      ...kin.unions(id).flatMap(({ other }) => (other === null ? [] : [other])),
    ]);
    for (const id of front) found.add(id);
  }
  return found;
}

const added = (parents: string[], born?: number): TreePerson => ({
  ...personOf({ id: "new", parents, born }),
  birth: born === undefined ? null : { text: String(born), qualifier: "exact", sort: born },
});

type Change = (person: TreePerson) => TreeSnapshot;

const withPerson = (person: TreePerson): TreeSnapshot => ({
  ...snapshot,
  people: [...snapshot.people, person],
});

const changes: Record<string, Change> = {
  "a child": ({ id, branch, birth }) =>
    withPerson({ ...added([id], (birth?.sort ?? 2_400_000) + 10_000), branch }),
  "a partner": ({ id }) => ({
    ...withPerson(added([])),
    unions: [
      ...snapshot.unions,
      {
        id: "new",
        kind: "marriage",
        partners: [id, "new"],
        began: null,
        branch: null,
        certainty: "hypothesis",
      },
    ],
  }),
  "a parent": ({ id }) => ({
    ...snapshot,
    people: [
      ...snapshot.people.map((person) =>
        person.id === id && person.parents.length === 0
          ? { ...person, parents: added(["new"]).parents }
          : person,
      ),
      { ...added([]), branch: snapshot.people.find((person) => person.id === id)?.branch ?? null },
    ],
  }),
};

describe("the measure", () => {
  const tracks = [["a", "b", "c", "d"]];

  it("is 1 when nothing changed", () => {
    expect(stability(tracks, [["a", "b", "c", "d"]])).toEqual({ pairs: 3, kept: 3, share: 1 });
  });

  it("is 1 when somebody came in between", () => {
    expect(stability(tracks, [["a", "new", "b", "c", "d"]]).share).toBe(1);
  });

  it("falls when neighbors change places", () => {
    expect(stability(tracks, [["b", "a", "c", "d"]])).toEqual({ pairs: 3, kept: 2, share: 2 / 3 });
  });

  it("falls when neighbors part", () => {
    expect(
      stability(tracks, [
        ["a", "b"],
        ["c", "d"],
      ]).share,
    ).toBe(2 / 3);
  });

  it("leaves out those it is told to", () => {
    expect(stability(tracks, [["b", "a", "c", "d"]], new Set(["a"])).share).toBe(1);
  });

  it("is 1 for nothing at all", () => {
    expect(stability([], []).share).toBe(1);
  });
});

describe("after adding one person the map", () => {
  const before = draw(snapshot);

  it.each(Object.entries(changes))("keeps the order of everybody else: %s", (_, change) => {
    const shares: number[] = [];
    for (const person of snapshot.people.filter((__, i) => i % 5 === 0)) {
      const after = draw(change(person));
      const except = near(snapshot, person.id, 2);
      shares.push(stability(mapTracks(before), mapTracks(after), except).share);
      // Pages stand where they stood.
      const pages = after.pages.map(({ branch }) => branch);
      expect(pages).toEqual(before.pages.map(({ branch }) => branch));
      expect(after.perRow).toBe(before.perRow);
    }
    expect(shares.length).toBeGreaterThan(50);
    expect(Math.min(...shares)).toBe(1);
  });
});

describe("after adding one person the view around somebody", () => {
  it("does not change when the person is out of sight", () => {
    const focus = "p28";
    const options = { measure, wording: wordingOf(snapshot) };
    const visible = around(snapshot, focus, options);
    const ids = new Set(visible.cards.map(({ person }) => person));
    const far = snapshot.people.find(({ id }) =>
      [...near(snapshot, id, 1)].every((other) => !ids.has(other)),
    ) as TreePerson;
    for (const change of Object.values(changes)) {
      expect(around(change(far), focus, options)).toEqual(visible);
    }
  });

  it("keeps the order of those who were there", () => {
    const options = { measure, wording: wordingOf(snapshot) };
    const columns = ({ cards }: ReturnType<typeof around>): string[][] => {
      const found: Record<number, typeof cards> = {};
      for (const card of cards) (found[card.generation] ??= []).push(card);
      return Object.values(found).map((list) =>
        list.sort((a, b) => a.y - b.y).map(({ key }) => key),
      );
    };
    for (const { id } of snapshot.people.filter((_, i) => i % 7 === 0)) {
      const before = around(snapshot, id, options);
      for (const { person } of before.cards) {
        const found = snapshot.people.find((one) => one.id === person);
        if (found === undefined || found.id === id) continue;
        const after = around((changes["a child"] as Change)(found), id, options);
        expect(stability(columns(before), columns(after)).share).toBe(1);
      }
    }
  });
});
