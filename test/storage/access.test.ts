import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { accessOver, migrateAccess, sqliteAccess } from "../../src/contexts/access";
import type { MemberId } from "../../src/kernel/id";
import { someStep, walk } from "../domain/access-steps";
import { MemoryAccess } from "../domain/memory-access";
import { idOf, person } from "./tree";

const day = 86_400_000;
const member = (name: string): MemberId => idOf("member", name);
const passkey = (id: string) => ({
  id,
  kind: "passkey" as const,
  label: id,
  publicKey: "key",
  counter: 0,
});

const objectOf = () => env.ACCESS.getByName(`access ${crypto.randomUUID()}`);

/** Every row of the access tables, as it lies there. */
function rowsOf(sql: SqlStorage): Record<string, unknown[]> {
  const tables = sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'access_*'",
    )
    .toArray();
  return Object.fromEntries(
    tables.map(({ name }) => [name, sql.exec(`SELECT * FROM ${name}`).toArray()]),
  );
}

/** A family with Ann as its keeper, and Bob as a second one. */
async function twoKeepers(stub: ReturnType<typeof objectOf>, now: number) {
  const code = {
    member: { id: member("ann"), name: "Ann" },
    credential: passkey("ann-1"),
    now,
    code: "c1",
  };
  expect(await stub.setUp(code)).toEqual({ ok: true, value: null });
  const input = { id: "i", hash: "h", role: "keeper" as const, person: null, now };
  expect((await stub.invite(member("ann"), input)).ok).toBe(true);
  const redeem = {
    hash: "h",
    now,
    member: { id: member("bob"), name: "Bob" },
    credential: passkey("bob-1"),
  };
  expect(await stub.redeem(redeem)).toEqual({ ok: true, value: member("bob") });
}

describe("the access of a family in its object", () => {
  // The object runs one call at a time: the second sees the first and is refused.
  it("keeps one keeper when two keepers revoke each other at the same moment", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    const both = await Promise.all([
      stub.revoke(member("ann"), member("bob"), now),
      stub.revoke(member("bob"), member("ann"), now),
    ]);
    expect(both.filter(({ ok }) => ok)).toHaveLength(1);
    const keepers = (await stub.members()).filter(
      ({ role, revokedAt }) => role === "keeper" && revokedAt === null,
    );
    expect(keepers).toHaveLength(1);
    // Lowering each other at once ends the same way.
    const other = objectOf();
    await twoKeepers(other, now);
    const lowered = await Promise.all([
      other.changeRole(member("ann"), member("bob"), "reader", now),
      other.changeRole(member("bob"), member("ann"), "reader", now),
    ]);
    expect(lowered.filter(({ ok }) => ok)).toHaveLength(1);
  });

  it("refuses a change made from a stale version of a member", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    const [bob] = (await stub.members()).filter(({ id }) => id === member("bob"));
    expect(bob?.version).toBe(1);
    expect(
      (
        await stub.changeRole(member("ann"), member("bob"), "editor", now, {
          [`member/${member("bob")}`]: 1,
        })
      ).ok,
    ).toBe(true);
    expect(
      await stub.revoke(member("ann"), member("bob"), now, { [`member/${member("bob")}`]: 1 }),
    ).toEqual({
      ok: false,
      error: { code: "stale-version", aggregate: `member/${member("bob")}`, current: 2 },
    });
  });

  it("logs a sign-in with a country, never an address, and who gave a recovery link", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    expect((await stub.signIn({ hash: "s1", credential: "bob-1", now, country: "DE" })).ok).toBe(
      true,
    );
    expect(
      (await stub.signIn({ hash: "s2", credential: "bob-1", now: now + 1, country: "203.0.113.7" }))
        .ok,
    ).toBe(true);
    const recovery = { id: "r", hash: "r", member: member("bob"), now: now + 2 };
    expect((await stub.recover(member("ann"), recovery)).ok).toBe(true);
    const log = await stub.log(member("ann"));
    expect(log).toEqual({
      ok: true,
      value: [
        {
          at: now + 2,
          kind: "recovery",
          member: member("bob"),
          credential: null,
          by: member("ann"),
          country: null,
        },
        {
          at: now + 1,
          kind: "sign-in",
          member: member("bob"),
          credential: "bob-1",
          by: null,
          country: null,
        },
        {
          at: now,
          kind: "sign-in",
          member: member("bob"),
          credential: "bob-1",
          by: null,
          country: "DE",
        },
      ],
    });
    // Somebody who is no keeper reads no log.
    expect(await stub.log(member("dan"))).toEqual({ ok: false, error: { code: "forbidden" } });
    await runInDurableObject(stub, (_, { storage }) => {
      expect(JSON.stringify(rowsOf(storage.sql))).not.toContain("203.0.113.7");
    });
  });

  it("keeps a spent recovery link spent when another is given", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    const give = (id: string) =>
      stub.recover(member("ann"), { id, hash: id, member: member("bob"), now });
    expect((await give("r1")).ok).toBe(true);
    expect((await stub.redeem({ hash: "r1", now, credential: passkey("bob-2") })).ok).toBe(true);
    expect((await give("r2")).ok).toBe(true);
    expect(await stub.redeem({ hash: "r1", now, credential: passkey("bob-3") })).toEqual({
      ok: false,
      error: { code: "spent" },
    });
  });

  it("ties nobody to a person erased from the tree, and keeps no address among the tries", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    await stub.remember([person("ada")]);
    const input = { id: "a", hash: "a", role: "reader" as const, person: person("ada"), now };
    expect(await stub.invite(member("ann"), input)).toEqual({
      ok: false,
      error: { code: "missing", id: person("ada") },
    });
    expect((await stub.attempt("sign-in", "203.0.113.7", now)).ok).toBe(true);
    await runInDurableObject(stub, (_, { storage }) => {
      expect(JSON.stringify(rowsOf(storage.sql))).not.toContain("203.0.113.7");
    });
  });

  it("takes only versions of members, by their keys", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    await expect(
      stub.revoke(member("ann"), member("bob"), now, { [`member/${member("bob")}/x`]: 1 }),
    ).rejects.toThrow("unknown-aggregate");
  });

  it("cleans what is over by an alarm, and wakes no more once nothing is left", async () => {
    const stub = objectOf();
    const now = Date.now();
    const long = now - 40 * day;
    await twoKeepers(stub, long);
    expect(
      (await stub.signIn({ hash: "old", credential: "ann-1", now: long, country: null })).ok,
    ).toBe(true);
    expect((await stub.signIn({ hash: "new", credential: "bob-1", now, country: null })).ok).toBe(
      true,
    );
    const old = { id: "j", hash: "j", role: "reader" as const, person: null, now: long };
    expect((await stub.invite(member("ann"), old)).ok).toBe(true);
    expect((await stub.attempt("sign-in", "address", long)).ok).toBe(true);
    await runInDurableObject(stub, async (_, { storage }) => {
      expect(await storage.getAlarm()).not.toBeNull();
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, async (_, { storage }) => {
      const rows = rowsOf(storage.sql);
      expect(rows.access_session?.map((one) => (one as { hash: string }).hash)).toEqual(["new"]);
      expect(rows.access_invitation).toEqual([]);
      expect(rows.access_attempt).toEqual([]);
      // A session is still there to be over some day.
      expect(await storage.getAlarm()).not.toBeNull();
      storage.sql.exec("DELETE FROM access_session");
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, async (_, { storage }) => {
      expect(await storage.getAlarm()).toBeNull();
    });
  });

  it("counts tries: ten sign-ins in a quarter of an hour, then when to try again", async () => {
    const stub = objectOf();
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      expect((await stub.attempt("sign-in", "address", now + i * 1000)).ok).toBe(true);
    }
    expect(await stub.attempt("sign-in", "address", now + 10_000)).toEqual({
      ok: false,
      error: { code: "rate-limited", retryAfter: 890 },
    });
    expect((await stub.attempt("sign-in", "another", now + 10_000)).ok).toBe(true);
    expect((await stub.attempt("sign-in", "address", now + 15 * 60_000)).ok).toBe(true);
  });

  it("lets a keeper give fifty invitations a day", async () => {
    const stub = objectOf();
    const now = Date.now();
    await twoKeepers(stub, now);
    for (let i = 0; i < 49; i++) {
      const input = { id: `i${i}`, hash: `h${i}`, role: "reader" as const, person: null, now };
      expect((await stub.invite(member("ann"), input)).ok).toBe(true);
    }
    const more = { id: "x", hash: "x", role: "reader" as const, person: null, now };
    expect(await stub.invite(member("ann"), more)).toEqual({
      ok: false,
      error: { code: "rate-limited", retryAfter: 86_400 },
    });
    // Recovery links count with them.
    const recovery = { id: "r", hash: "r", member: member("bob"), now };
    expect((await stub.recover(member("ann"), recovery)).ok).toBe(false);
    expect((await stub.invite(member("bob"), more)).ok).toBe(true);
  });
});

describe("the tables of access", () => {
  it("open a database that had only the ledger of erasures, with its rows", async () => {
    await runInDurableObject(objectOf(), (_, { storage }) => {
      const { sql } = storage;
      for (const { name } of sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'access_*'",
        )
        .toArray()) {
        sql.exec(`DROP TABLE ${name}`);
      }
      sql.exec("CREATE TABLE IF NOT EXISTS access_erased (id TEXT PRIMARY KEY) WITHOUT ROWID");
      sql.exec("INSERT INTO access_erased (id) VALUES (?)", person("ada"));
      migrateAccess(storage);
      const rows = rowsOf(sql);
      expect(rows.access_erased).toEqual([{ id: person("ada") }]);
      expect(Object.keys(rows).sort()).toEqual(
        [
          "access_attempt",
          "access_credential",
          "access_erased",
          "access_invitation",
          "access_log",
          "access_member",
          "access_salt",
          "access_schema",
          "access_session",
          "access_setup",
        ].sort(),
      );
      expect(() => migrateAccess(storage, [])).toThrow("schema-is-newer");
    });
  });

  it("read a row that is not what its schema says as corrupt, by its key and no content", async () => {
    await runInDurableObject(objectOf(), (_, { storage }) => {
      const store = sqliteAccess(storage.sql);
      const access = accessOver(store);
      const setUp = {
        member: { id: member("ann"), name: "Ann" },
        credential: passkey("ann-1"),
        now: 1,
        code: "c",
      };
      expect(access.setUp(setUp).ok).toBe(true);
      storage.sql.exec(
        "UPDATE access_member SET data = ? WHERE id = ?",
        '{"name":"Тайна"}',
        member("ann"),
      );
      expect(() => store.member(member("ann"))).toThrow(
        new RegExp(`^corrupt-row member/${member("ann")}$`),
      );
    });
  });

  it("do what memory does, over any operations on members", async () => {
    await runInDurableObject(objectOf(), (_, { storage }) => {
      fc.assert(
        fc.property(fc.array(someStep, { minLength: 1, maxLength: 40 }), (steps) => {
          for (const name of Object.keys(rowsOf(storage.sql))) {
            if (name !== "access_schema") storage.sql.exec(`DELETE FROM ${name}`);
          }
          const memory = accessOver(new MemoryAccess());
          const stored = accessOver(sqliteAccess(storage.sql));
          walk(memory, steps);
          walk(stored, steps);
          const seen = (access: typeof memory) =>
            // Versions are counted by the database only.
            access.members().map((one) => ({
              ...one,
              version: 0,
              credentials: access.credentialsOf(one.id),
            }));
          expect(seen(stored)).toEqual(seen(memory).sort((a, b) => (a.id < b.id ? -1 : 1)));
        }),
        { numRuns: 60 },
      );
    });
  });
});
