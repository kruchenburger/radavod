import fc from "fast-check";
import type { KinshipCommand } from "../../src/contexts/kinship";
import type { LifeEvent } from "../../src/contexts/life";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { Result } from "../../src/kernel/result";
import { restoreTo } from "../../src/scenarios/restore-to";
import { restore, trash } from "../../src/scenarios/trash";
import { undo } from "../../src/scenarios/undo";
import type { Contexts } from "../../src/scenarios/unit-of-work";
import { addBranch, anna, branch, event, form, parentage, person, type Tree, union } from "./tree";

/** Random steps over a few people, of every kind a tree knows, and what they leave behind. */

export const wedding = (more: Partial<LifeEvent> = {}): LifeEvent => ({
  id: event("wedding"),
  kind: "wedding",
  title: "",
  date: parseFuzzyDate("1885"),
  place: null,
  participants: [
    { person: person("ada"), role: "principal" },
    { person: person("eve"), role: "principal" },
  ],
  union: null,
  main: true,
  certainty: "hypothesis",
  note: "",
  ...more,
});

export const edit = (who: string, patch: object): KinshipCommand => ({
  do: "edit-person",
  id: person(who),
  patch,
});
export const people = ["ada", "eve", "kid", "dan"];
export const anyone = fc.constantFrom(...people);
export const someStep = fc.oneof(
  fc.record({ do: fc.constant("person" as const), who: anyone }),
  fc.record({
    do: fc.constant("sex" as const),
    who: anyone,
    sex: fc.constantFrom("male" as const, "female" as const),
  }),
  fc.record({
    do: fc.constant("name" as const),
    who: anyone,
    id: fc.constantFrom("n1", "n2", "n3"),
    given: fc.constantFrom("Дуб", "Вяз"),
  }),
  fc.record({ do: fc.constant("unname" as const), who: anyone, id: fc.constantFrom("n1", "n2") }),
  fc.record({ do: fc.constant("parent" as const), who: anyone, other: anyone, main: fc.boolean() }),
  fc.record({ do: fc.constant("orphan" as const), who: anyone, other: anyone }),
  fc.record({ do: fc.constant("union" as const), who: anyone, other: anyone }),
  fc.record({ do: fc.constant("divorce" as const) }),
  fc.record({
    do: fc.constant("event" as const),
    who: anyone,
    other: anyone,
    year: fc.constantFrom("1885", "1890"),
    ofUnion: fc.boolean(),
  }),
  fc.record({ do: fc.constant("forget" as const), who: anyone }),
  fc.record({ do: fc.constant("branch" as const), who: anyone }),
  fc.record({ do: fc.constant("trash" as const), who: anyone }),
  fc.record({ do: fc.constant("back" as const), who: anyone }),
  fc.record({ do: fc.constant("undo" as const), back: fc.integer({ min: 0, max: 5 }) }),
  fc.record({ do: fc.constant("restore" as const), back: fc.integer({ min: 0, max: 8 }) }),
);
export type Step = typeof someStep extends fc.Arbitrary<infer T> ? T : never;

export function take(tree: Tree, step: Step): boolean {
  const result = tree.run((c: Contexts): Result<object, { code: string }> => {
    const at = c.history.last();
    switch (step.do) {
      case "person":
        return c.kinship.apply({
          do: "add-person",
          person: {
            id: person(step.who),
            sex: "unknown",
            living: "unknown",
            names: [form("n1")],
            mainName: "n1",
          },
          branch: null,
        });
      case "sex":
        return c.kinship.apply(edit(step.who, { sex: step.sex }));
      case "name":
        return c.kinship.apply({
          do: "put-name",
          person: person(step.who),
          name: form(step.id, { given: step.given }),
        });
      case "unname":
        return c.kinship.apply({
          do: "remove-name",
          person: person(step.who),
          id: step.id,
        });
      case "parent":
        return c.kinship.apply({
          do: "add-parent",
          child: person(step.who),
          parentage: parentage(step.other, { main: step.main }),
        });
      case "orphan":
        return c.kinship.apply({
          do: "remove-parent",
          child: person(step.who),
          id: step.other,
        });
      case "union":
        return c.kinship.apply({
          do: "add-union",
          union: {
            id: union("u"),
            partners: [person(step.who), person(step.other)],
            kind: "civil",
            branch: null,
            certainty: "hypothesis",
          },
        });
      case "divorce":
        return c.kinship.apply({ do: "remove-union", id: union("u") });
      case "event": {
        const told = wedding({
          id: event(`w ${step.who}`),
          date: parseFuzzyDate(step.year),
          union: step.ofUnion ? union("u") : null,
          participants: [
            { person: person(step.who), role: "principal" },
            { person: person(step.other), role: "witness" },
          ],
        });
        const known = c.life.event(person(step.who), told.id);
        return known ? c.life.edit(person(step.who), told) : c.life.add(told);
      }
      case "forget":
        return c.life.remove(person(step.who), event(`w ${step.who}`));
      case "branch": {
        if (c.kinship.branch(branch("green")) === null) addBranch(c, "green");
        return c.kinship.apply({
          do: "assign-branch",
          person: person(step.who),
          branch: branch("green"),
          descendants: true,
          overwrite: false,
        });
      }
      case "trash":
        return trash(c, person(step.who), { actor: anna, now: 5 });
      case "back":
        return restore(c, person(step.who));
      case "undo":
        return undo(c, at - step.back);
      case "restore":
        return restoreTo(c, at - step.back);
    }
  });
  return result.ok;
}
