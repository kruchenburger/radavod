import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { stateOf } from "../../examples/snapshot.ts";
import { generateFamily } from "../../examples/generate.ts";
import { eraseForever, eraseHere } from "../../src/scenarios/erase";
import { type Packed, snapshotsOf } from "../../src/scenarios/snapshot";
import { versionsOf } from "../../src/scenarios/versions";
import { snapshotOf } from "../../src/shared/snapshot";
import type { FamilyTree } from "../../src/worker/family-tree";
import { type TreeSnapshot, treeSnapshotSchema } from "../../src/shared/tree";
import { fill, rowsOf } from "./schema-1";
import { edit, someStep, take } from "./steps";
import {
  accepted,
  addPerson,
  anna,
  event,
  form,
  idOf,
  inTree,
  person,
  place,
  type Tree,
} from "./tree";

async function unpacked({ encoding, body }: Packed): Promise<TreeSnapshot> {
  expect(encoding).toBe("gzip");
  const stream = new Response(body).body?.pipeThrough(new DecompressionStream("gzip"));
  return treeSnapshotSchema.parse(await new Response(stream).json());
}

const opened = async (tree: Tree) =>
  unpacked(await snapshotsOf(tree.counted, tree.work).snapshot());
const epochOf = (tree: Tree) => versionsOf(tree.storage, tree.work).epoch();

describe("the snapshot of a tree", () => {
  it("is the invented family as the sample shows it, made by the same code", () =>
    inTree(async (tree) => {
      const family = generateFamily(1, 300);
      fill(tree.storage.sql, rowsOf(family));
      const snapshot = await opened(tree);
      const head = { version: 1, epoch: epochOf(tree) };
      // The database keeps aggregates by their identifiers, the family in its own order.
      expect(sorted(snapshot)).toEqual(sorted(snapshotOf(stateOf(family, idOf), head)));
      expect(snapshot.people).toHaveLength(300);
    }));

  it("is kept, and opening it then reads at most 5 rows and writes none", () =>
    inTree(async (tree) => {
      tree.do((c) => addPerson(c, "ada"));
      const first = await snapshotsOf(tree.counted, tree.work).snapshot();
      let again: Packed | undefined;
      const rows = await tree.countAsync(async () => {
        again = await snapshotsOf(tree.counted, tree.work).snapshot();
      });
      expect(rows.read).toBeLessThanOrEqual(5);
      expect(rows.written).toBe(0);
      expect(again).toEqual(first);
    }));

  it("is made again after an edit, and in another epoch", () =>
    inTree(async (tree) => {
      tree.do((c) => addPerson(c, "ada"));
      expect((await opened(tree)).people.map(({ sex }) => sex)).toEqual(["unknown"]);
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      const edited = await opened(tree);
      expect(edited).toMatchObject({ version: 2, epoch: epochOf(tree) });
      expect(edited.people.map(({ sex }) => sex)).toEqual(["female"]);

      versionsOf(tree.storage, tree.work).renewEpoch("after a rollback");
      expect(await opened(tree)).toMatchObject({ version: 2, epoch: "after a rollback" });
    }));

  it("is not kept while somebody is erased, and the erasure takes the kept one away", () =>
    inTree(async (tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => addPerson(c, "eve"));
      await opened(tree);
      const ledger = { remember: () => {}, all: () => [] };
      const id = person("ada");
      const newId = () => event("new");
      const erased = await eraseForever(ledger, tree.work, { actor: anna, now: 5 }, id, newId);
      expect(erased.ok).toBe(true);
      expect(JSON.stringify(tree.rows())).not.toContain(id);
      expect(tree.rows().history_snapshot).toEqual([]);
      const snapshot = await opened(tree);
      expect(snapshot.people.map((one) => one.id)).toEqual([person("eve")]);
    }));
});

describe("a snapshot made while somebody is erased", () => {
  it("is neither given nor kept with them", () =>
    inTree(async (tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => addPerson(c, "eve"));
      const id = person("ada");
      // It reads the tree at once and is packed after a wait, in which the erasure comes.
      const pending = snapshotsOf(tree.storage, tree.work).rebuild();
      const erased = eraseHere(tree.work, { actor: anna, now: 5 }, id, () => event("new"));
      expect(erased.ok).toBe(true);
      const snapshot = await unpacked(await pending);
      expect(snapshot.people.map((one) => one.id)).toEqual([person("eve")]);
      expect(JSON.stringify(tree.rows())).not.toContain(id);
    }));
});

describe("the snapshot in the object", () => {
  /** The object as the code inside it sees it. */
  type Inside = { unitOfWork: Tree["work"] } & FamilyTree;

  it("is made again by an alarm after an edit, and given packed", async () => {
    const stub = env.TREE.getByName(`alarm ${crypto.randomUUID()}`);
    const before = await stub.snapshot();
    expect(before).toMatchObject({ version: 0, encoding: "gzip" });
    await runInDurableObject(stub, async (instance: FamilyTree, state) => {
      expect(await state.storage.getAlarm()).toBeNull();
      const done = (instance as Inside).unitOfWork.run(
        { actor: anna, now: 5, scenario: "test", expected: {} },
        (c) => {
          addPerson(c, "ada");
          return { ok: true, value: {} };
        },
      );
      expect(done.ok).toBe(true);
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, (_, state) => {
      const rows = state.storage.sql.exec("SELECT version FROM history_snapshot").toArray();
      expect(rows).toEqual([{ version: 1 }]);
    });
    const after = await stub.snapshot();
    expect((await unpacked(after)).people.map(({ id }) => id)).toEqual([person("ada")]);
    expect(await stub.changesSince(0, after.epoch)).toEqual({
      version: 1,
      changed: [{ aggregate: `person/${person("ada")}`, version: 1 }],
    });
  });
});

describe("changes since a version", () => {
  const since = (tree: Tree, version: number, epoch = epochOf(tree)) =>
    snapshotsOf(tree.storage, tree.work).changesSince(version, epoch);

  it("name what the snapshot shows of the edited aggregates, with their versions", () =>
    inTree((tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => addPerson(c, "eve"));
      tree.do((c) => accepted(c.kinship.apply(edit("ada", { sex: "female" }))));
      tree.do((c) =>
        accepted(c.kinship.apply({ do: "put-name", person: person("ada"), name: form("n2") })),
      );
      tree.do((c) =>
        accepted(
          c.places.add({
            id: place("vilnia"),
            names: [],
            affiliations: [],
            coordinates: null,
          }),
        ),
      );
      expect(since(tree, 2)).toEqual({
        version: 5,
        changed: [
          { aggregate: `person/${person("ada")}`, version: 4 },
          { aggregate: `place/${place("vilnia")}`, version: 5 },
        ],
      });
      expect(since(tree, 5)).toEqual({ version: 5, changed: [] });
    }));

  it("ask for a reload in another epoch, from a version not yet made, and after an erasure", () =>
    inTree(async (tree) => {
      tree.do((c) => addPerson(c, "ada"));
      tree.do((c) => addPerson(c, "eve"));
      expect(since(tree, 1, "another")).toBe("reload");
      expect(since(tree, 3)).toBe("reload");
      expect(since(tree, -1)).toBe("reload");
      expect(since(tree, 1.5)).toBe("reload");
      const ledger = { remember: () => {}, all: () => [] };
      const newId = () => event("new");
      await eraseForever(ledger, tree.work, { actor: anna, now: 5 }, person("eve"), newId);
      expect(since(tree, 2)).toBe("reload");
    }));

  it(
    "bring a client that asks for them again to the snapshot made anew",
    () =>
      fc.assert(
        fc.asyncProperty(
          fc.array(someStep, { minLength: 5, maxLength: 20 }),
          fc.array(someStep, { minLength: 1, maxLength: 20 }),
          (before, after) =>
            inTree(async (tree) => {
              for (const step of before) take(tree, step);
              const client = await opened(tree);
              for (const step of after) take(tree, step);
              const fresh = await opened(tree);
              const changes = since(tree, client.version, client.epoch);
              if (changes === "reload") throw new Error("no erasure, no reload");
              expect(changes.version).toBe(fresh.version);
              expect(sorted(applied(client, changes.changed, fresh))).toEqual(sorted(fresh));
            }),
        ),
        { numRuns: 60 },
      ),
    60_000,
  );
});

type Keyed = { id: string };

/** What a client has after it asked for each named aggregate again: the new one, or none. */
function applied(
  client: TreeSnapshot,
  changed: readonly { aggregate: string }[],
  server: TreeSnapshot,
): TreeSnapshot {
  const lists = { person: "people", union: "unions", branch: "branches", place: "places" } as const;
  const next = { ...client, version: server.version, epoch: server.epoch };
  for (const { aggregate } of changed) {
    const [kind, id] = aggregate.split("/") as [keyof typeof lists, string];
    const list = lists[kind];
    const now = (server[list] as Keyed[]).find((one) => one.id === id);
    const others = (next[list] as Keyed[]).filter((one) => one.id !== id);
    (next as Record<string, unknown>)[list] = now === undefined ? others : [...others, now];
  }
  return next;
}

function sorted(snapshot: TreeSnapshot): TreeSnapshot {
  const byId = <T extends Keyed>(list: T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    ...snapshot,
    people: byId(snapshot.people),
    unions: byId(snapshot.unions),
    branches: byId(snapshot.branches),
    places: byId(snapshot.places),
  };
}
