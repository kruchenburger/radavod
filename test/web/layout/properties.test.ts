import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { type TreeSnapshot, treeSnapshotSchema } from "../../../src/shared/tree";
import { around, type AroundOptions } from "../../../web/tree/layout/around";
import { aroundNarrow } from "../../../web/tree/layout/around-narrow";
import { branchMap, type MapCard } from "../../../web/tree/layout/branch-map";
import { aroundKeys, mapKeys } from "../../../web/tree/layout/keys";
import { mapText } from "../../../web/tree/layout/map-text";
import { personKey } from "../../../web/tree/layout/types";
import { expectedAround, expectedLine, lineAround } from "./expected";
import { measure, wordingOf } from "./family";
import { problems } from "./geometry";
import { unreachable } from "./reach";

const size = 9;
const certainty = fc.constantFrom(
  "hypothesis",
  "one-source",
  "confirmed",
  "contradiction",
  "unresolved",
);
/** Somebody of the family, or an id nobody has. */
const someone = fc.oneof(
  { weight: 20, arbitrary: fc.nat(size - 1).map((i) => `p${i}`) },
  { weight: 1, arbitrary: fc.constant("nobody") },
);
const word = fc.oneof(
  fc.string({ unit: "grapheme", maxLength: 12 }),
  fc.stringMatching(/^[А-Яа-я -]{0,20}$/u),
  fc.constantFrom("", "Вересницкая-Заболотская", "Ш".repeat(500), "я ".repeat(250), "أحمد", "👩‍👩‍👧"),
);
const year = fc.option(
  fc.record({
    text: word,
    qualifier: fc.constantFrom("exact", "about", "before", "after", "between", "unread"),
    sort: fc.option(fc.integer({ min: -5, max: 5 })),
  }),
);
const form = fc.record({
  kind: fc.constantFrom("birth", "married", "church", "nickname", "variant"),
  language: fc.constantFrom("ru", "be", "pl", "other"),
  script: fc.constantFrom("Cyrl", "Latn", "Hebr", "other"),
  given: fc.option(word),
  patronymic: fc.constant(null),
  surname: fc.option(word),
  certainty,
});
const branchId = fc.option(fc.constantFrom("A", "B", "C", "nowhere"));

const person = fc.record({
  sex: fc.constantFrom("male", "female", "other", "unknown"),
  living: fc.constantFrom("yes", "no", "unknown"),
  name: fc.option(form),
  otherNames: fc.constant([]),
  branch: branchId,
  parents: fc.array(
    fc.record({
      parent: fc.option(someone),
      union: fc.option(fc.constantFrom("u0", "u1", "u2", "u3", "gone"), { freq: 1 }),
      kind: fc.constantFrom("blood", "blood", "adoption", "guardianship", "unknown"),
      main: fc.boolean(),
      certainty,
    }),
    { maxLength: 4, size: "max" },
  ),
  birth: year,
  death: year,
  place: fc.constant(null),
});

const snapshots = fc
  .record({
    people: fc.array(person, { maxLength: size, size: "max" }),
    unions: fc.array(
      fc.record({
        kind: fc.constantFrom("marriage", "civil", "unknown"),
        partners: fc.tuple(someone, fc.option(someone, { freq: 8 })),
        began: fc.option(fc.integer({ min: 0, max: 5 })),
        branch: branchId,
        certainty,
      }),
      { maxLength: 8, size: "max" },
    ),
    branches: fc.subarray(["A", "B", "C"]),
    sameIds: fc.boolean(),
  })
  .map(({ people, unions, branches, sameIds }): TreeSnapshot =>
    treeSnapshotSchema.parse({
      format: 1,
      version: 0,
      // Sometimes the last person has the id of the first.
      people: people.map((one, i) => ({
        ...one,
        parents: one.parents.map((parentage, k) => ({ ...parentage, id: `k${k}` })),
        id: sameIds && i === size - 1 ? "p0" : `p${i}`,
      })),
      unions: unions.map((one, i) => ({ ...one, id: `u${i}` })),
      branches: branches.map((id, i) => ({ id, title: { ru: id, en: id }, color: i })),
      places: [],
    }),
  );

/** A fixed seed keeps CI the same from run to run; shrinking finds the smallest family. */
vi.setConfig({ testTimeout: 60_000 });
const runs = { numRuns: 300, seed: 12 };

/** The people of a drawing, to ask for each of them in turn. */
const everybody = ({ people }: TreeSnapshot): string[] => [...new Set(people.map(({ id }) => id))];

describe("any family the contract allows", () => {
  const draws = fc.record({ siblings: fc.boolean(), open: fc.option(someone.map(personKey)) });

  it("is drawn right around everybody", () => {
    fc.assert(
      fc.property(snapshots, draws, (snapshot, more) => {
        for (const focus of everybody(snapshot)) {
          const options: AroundOptions = {
            measure,
            wording: wordingOf(snapshot),
            lineOf: focus,
            ...more,
          };
          const layout = around(snapshot, focus, options);
          const byKey = new Map(layout.cards.map((card) => [card.key, card]));
          const found = problems(layout, {
            snapshot,
            people: expectedAround(snapshot, focus, { ...more, open: layout.open }),
            children: "y",
            line: lineAround(snapshot, focus, focus),
            lines: ({ key }) => byKey.get(key)?.lines ?? [],
            measure,
          });
          expect({ focus, ...found }).toEqual({ focus });
          expect(unreachable(layout.cards, aroundKeys(layout))).toEqual([]);
        }
      }),
      runs,
    );
  });

  it("is listed right around everybody", () => {
    fc.assert(
      fc.property(snapshots, draws, fc.integer({ min: 0, max: 400 }), (snapshot, more, width) => {
        for (const focus of everybody(snapshot)) {
          const options = { measure, wording: wordingOf(snapshot), lineOf: focus, ...more, width };
          const layout = aroundNarrow(snapshot, focus, options);
          const byKey = new Map(layout.cards.map((card) => [card.key, card]));
          const found = problems(layout, {
            snapshot,
            people: expectedAround(snapshot, focus, { ...more, open: layout.open }),
            children: "y",
            line: lineAround(snapshot, focus, focus),
            lines: ({ key }) => byKey.get(key)?.lines ?? [],
            measure,
            isList: true,
          });
          expect({ focus, ...found }).toEqual({ focus });
        }
      }),
      runs,
    );
  });

  it("is drawn right on the map of branches", () => {
    const options = fc.record({
      level: fc.constantFrom("far" as const, "closer" as const, "near" as const),
      lineOf: fc.option(someone),
      perRow: fc.integer({ min: 1, max: 4 }),
    });
    fc.assert(
      fc.property(snapshots, options, (snapshot, more) => {
        const map = branchMap(snapshot, { ...more, measure, headOf: ({ title }) => title.ru });
        const cards = new Map(map.cards.map((card) => [card.key, card]));
        const byId = new Map<string, TreeSnapshot["people"][number]>();
        for (const one of snapshot.people) if (!byId.has(one.id)) byId.set(one.id, one);
        const wording = wordingOf(snapshot);
        const found = problems(map, {
          snapshot,
          people: byId.keys(),
          children: "x",
          line: expectedLine(snapshot, more.lineOf),
          spacing: { least: 6, outside: map.pages },
          row: ({ key }) => `${cards.get(key)?.page} ${cards.get(key)?.row}`,
          lines: ({ key }) => {
            const card = cards.get(key) as MapCard;
            return mapText(card, { map, measure, wording, person: (id) => byId.get(id) });
          },
          measure,
        });
        expect(found).toEqual({});
        expect(unreachable(map.cards, mapKeys(map))).toEqual([]);
      }),
      { ...runs, numRuns: 1000 },
    );
  });
});
