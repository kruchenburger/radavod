import fc from "fast-check";
import { expect, it } from "vitest";
import type { Change, KinshipCommand, Parentage } from "../../src/contexts/kinship";
import type { PersonId, UnionId } from "../../src/kernel/id";
import { branch, Family, type MemoryKinship, person, union } from "./memory-kinship";

const people = ["a", "b", "c", "d", "e"];
const anyone = fc.constantFrom(...people).map(person);
const someone = fc.oneof({ weight: 5, arbitrary: anyone }, fc.constant("unknown" as const));
const parentageId = fc.constantFrom("1", "2", "3", "4");
const unionId = fc.constantFrom("u", "v", "w").map(union);
const branchId = fc.constantFrom("green", "red").map(branch);
const certainty = fc.constantFrom("hypothesis" as const, "confirmed" as const);
const kind = fc.constantFrom(
  "blood" as const,
  "blood" as const,
  "adoption" as const,
  "guardianship" as const,
  "unknown" as const,
);
const maybe = <T>(value: fc.Arbitrary<T>) =>
  fc.oneof({ weight: 3, arbitrary: fc.constant(null) }, value);
const partners = fc.tuple(anyone, someone);
const name = fc.record({
  id: fc.constantFrom("n1", "n2"),
  language: fc.constant("ru" as const),
  script: fc.constant("Cyrl" as const),
  kind: fc.constant("birth" as const),
  given: fc.string(),
  patronymic: fc.constant(""),
  surname: fc.string(),
  certainty,
});

const parentage: fc.Arbitrary<Parentage> = fc.record({
  id: parentageId,
  parent: someone,
  union: maybe(unionId),
  kind,
  main: fc.boolean(),
  certainty,
});

const command: fc.Arbitrary<KinshipCommand> = fc.oneof(
  fc.record({
    do: fc.constant("add-person" as const),
    person: fc.record({
      id: fc.constantFrom("late", "later", "a").map(person),
      sex: fc.constant("unknown" as const),
      living: fc.constant("yes" as const),
      names: fc.array(name, { maxLength: 2 }),
      mainName: maybe(fc.constantFrom("n1", "n2")),
    }),
    branch: maybe(branchId),
  }),
  {
    weight: 12,
    arbitrary: fc.record({ do: fc.constant("add-parent" as const), child: anyone, parentage }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      do: fc.constant("edit-parent" as const),
      child: anyone,
      id: parentageId,
      patch: fc.record(
        { parent: someone, union: maybe(unionId), kind, main: fc.boolean(), certainty },
        { requiredKeys: [] },
      ),
    }),
  },
  fc.record({ do: fc.constant("remove-parent" as const), child: anyone, id: parentageId }),
  {
    weight: 3,
    arbitrary: fc.record({
      do: fc.constant("add-union" as const),
      union: fc.record({
        id: unionId,
        partners,
        kind: fc.constant("marriage" as const),
        branch: maybe(branchId),
        certainty,
      }),
    }),
  },
  fc.record({
    do: fc.constant("edit-union" as const),
    id: unionId,
    patch: fc.record({ partners, branch: maybe(branchId), certainty }, { requiredKeys: [] }),
  }),
  fc.record({ do: fc.constant("remove-union" as const), id: unionId }),
  fc.record({ do: fc.constant("remove-branch" as const), id: branchId }),
  fc.record({
    do: fc.constant("add-branch" as const),
    branch: fc.record({
      id: branchId,
      title: fc.constant({ ru: "", en: "" }),
      color: fc.constant(0 as const),
    }),
  }),
  fc.record({
    do: fc.constant("assign-branch" as const),
    person: anyone,
    branch: maybe(branchId),
    descendants: fc.boolean(),
    overwrite: fc.boolean(),
  }),
  fc.record({
    do: fc.constant("order-children" as const),
    person: anyone,
    order: fc.uniqueArray(anyone, { maxLength: 2 }),
  }),
  fc.record({ do: fc.constant("put-name" as const), person: anyone, name }),
  fc.record({ do: fc.constant("remove-name" as const), person: anyone, id: name.map((n) => n.id) }),
  fc.record({
    do: fc.constant("edit-person" as const),
    id: anyone,
    patch: fc.record(
      { mainName: fc.constantFrom("n1", "n2"), living: fc.constant("no" as const) },
      { requiredKeys: [] },
    ),
  }),
);

const commands = fc.array(command, { minLength: 20, maxLength: 80, size: "max" });

/** What is wrong with a family, found without the code under test. */
function problems({ people, unions: records, branches, branchOf }: MemoryKinship): string[] {
  const branchIn = (id: PersonId | UnionId) => branchOf.get(id) ?? null;
  const all = new Map([...people].map(([id, one]) => [id, { ...one, branch: branchIn(id) }]));
  const unions = new Map([...records].map(([id, one]) => [id, { ...one, branch: branchIn(id) }]));
  const found: string[] = [];
  const has = (where: ReadonlyMap<string, unknown>, id: string | null, from: string) => {
    if (id !== null && id !== "unknown" && !where.has(id)) found.push(`${from} names ${id}`);
  };
  for (const [id, { parents, children, childOrder, names, mainName, ...one }] of all) {
    if (one.id !== id) found.push(`${id} is stored as another`);
    has(branches, one.branch, id);
    const mainBlood = parents.filter((link) => link.kind === "blood" && link.main);
    if (mainBlood.length > 2) found.push(`${id} has ${mainBlood.length} main blood parents`);
    if (new Set(parents.map((link) => link.id)).size < parents.length) found.push(`${id} ids`);
    for (const link of parents) {
      has(all, link.parent, id);
      has(unions, link.union, id);
      const owners = link.union === null ? null : unions.get(link.union)?.partners;
      if (link.union !== null && (link.parent === "unknown" || !owners?.includes(link.parent)))
        found.push(`${id} of a strange union`);
    }
    const mirrored = [...all.values()]
      .filter((other) => other.parents.some(({ parent }) => parent === id))
      .map((other) => other.id);
    expect([...children].sort()).toEqual(mirrored.sort());
    if (childOrder.some((child) => !children.includes(child))) found.push(`${id} orders others`);
    const married = [...unions.values()].filter((u) => u.partners.includes(id)).map((u) => u.id);
    expect([...one.unions].sort()).toEqual(married.sort());
    const ids = names.map((form) => form.id);
    if (new Set(ids).size < ids.length) found.push(`${id} has names of one identifier`);
    const isShown = mainName === null ? ids.length === 0 : ids.includes(mainName);
    if (!isShown) found.push(`${id} shows no name`);
  }
  for (const { id, partners: two, branch: own } of unions.values()) {
    if (two[0] === two[1]) found.push(`${id} of one person`);
    for (const partner of two) has(all, partner, id);
    has(branches, own, id);
  }
  for (const [member, own] of branchOf) {
    if (!people.has(member as PersonId) && !records.has(member as UnionId)) {
      found.push(`${member} is gone and in ${own}`);
    }
  }
  // Whoever has no parents left is taken away, until nobody is left: else there is a circle.
  const left = new Map(
    [...all.values()].map(({ id, parents }) => [
      id,
      new Set(
        parents
          .filter((link) => link.kind === "blood" || link.kind === "adoption")
          .map(({ parent }) => parent)
          .filter((parent) => parent !== "unknown"),
      ),
    ]),
  );
  for (let taken = true; taken;) {
    taken = false;
    for (const [id, parents] of left) {
      if (parents.size > 0) continue;
      left.delete(id);
      for (const others of left.values()) others.delete(id);
      taken = true;
    }
  }
  if (left.size > 0) found.push(`a circle of ${[...left.keys()].join(", ")}`);
  return found;
}

const start = (): Family => {
  const family = new Family(...people);
  family.withBranch("green");
  family.withBranch("red");
  return family;
};

it("a family stays possible after any commands", { timeout: 30_000 }, () => {
  const seen = new Set<string>();
  fc.assert(
    fc.property(commands, (list) => {
      const family = start();
      for (const next of list) {
        const before = family.store.snapshot();
        const result = family.apply(next);
        seen.add(result.ok ? next.do : result.error.code);
        if (!result.ok) {
          expect(family.store.snapshot()).toEqual(before);
          continue;
        }
        expect(problems(family.store)).toEqual([]);
        for (const write of result.value) expect(write.after).not.toEqual(write.before);
      }
    }),
    { numRuns: 300 },
  );
  // The commands are not refused out of hand, and each refusal is met.
  expect([...seen].sort()).toEqual(
    [
      "add-branch",
      "add-parent",
      "add-person",
      "add-union",
      "assign-branch",
      "cycle",
      "duplicate",
      "edit-parent",
      "edit-person",
      "edit-union",
      "missing",
      "not-a-child",
      "not-a-partner",
      "order-children",
      "put-name",
      "remove-branch",
      "remove-name",
      "remove-parent",
      "remove-union",
      "same-person",
      "third-main-blood-parent",
    ].sort(),
  );
});

it("a refused cycle is one: each on the way is a parent of the one before", () => {
  let cycles = 0;
  fc.assert(
    fc.property(commands, (list) => {
      const family = start();
      for (const next of list) {
        const result = family.apply(next);
        if (result.ok || result.error.code !== "cycle") continue;
        cycles++;
        const { path } = result.error;
        const [child, parent] = path;
        expect(next).toMatchObject({ child });
        if (next.do === "add-parent") expect(next.parentage.parent).toBe(parent);
        expect(path.at(-1)).toBe(child);
        for (let i = 1; i + 1 < path.length; i++) {
          const links = family.store.people.get(path[i] ?? person(""))?.parents ?? [];
          const tied = links.some(
            (link) =>
              link.parent === path[i + 1] && (link.kind === "blood" || link.kind === "adoption"),
          );
          expect(tied).toBe(true);
        }
      }
    }),
  );
  expect(cycles).toBeGreaterThan(50);
});

it(
  "what is written rebuilds the family, and written back it undoes a command",
  { timeout: 30_000 },
  () => {
    fc.assert(
      fc.property(commands, (list) => {
        const family = start();
        const copy = start().store;
        for (const next of list) {
          const before = family.store.snapshot();
          const result = family.apply(next);
          if (!result.ok) continue;
          const change = structuredClone(result.value);
          copy.save(change);
          expect(copy.snapshot()).toEqual(family.store.snapshot());
          const back = change.toReversed().map(({ before: after, after: was, ...write }) => ({
            ...write,
            before: was,
            after,
          }));
          copy.save(back as Change);
          expect(copy.snapshot()).toEqual(before);
          copy.save(change);
        }
      }),
    );
  },
);
