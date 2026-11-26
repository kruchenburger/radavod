import { describe, expect, it } from "vitest";
import {
  type Access,
  accessOver,
  type Action,
  can,
  type NewCredential,
  type Role,
} from "../../src/contexts/access";
import type { MemberId } from "../../src/kernel/id";
import { idOf, person } from "../storage/tree";
import { openChallenge, takeChallenge } from "../../src/contexts/access/domain/challenge";
import { invite } from "../../src/contexts/access/domain/invitation";
import {
  NICKNAME_ADJECTIVES,
  NICKNAME_CREATURES,
  nicknameFor,
} from "../../src/contexts/access/domain/nickname";
import { writes } from "../../src/kernel/change";
import {
  NICKNAME_ADJECTIVES as SHARED_ADJECTIVES,
  NICKNAME_CREATURES as SHARED_CREATURES,
} from "../../src/shared/nickname";
import { MemoryAccess } from "./memory-access";

const day = 86_400_000;
const start = 1_800_000_000_000;
const member = (name: string): MemberId => idOf("member", name);
const passkey = (id: string): NewCredential => ({
  id,
  kind: "passkey",
  label: id,
  publicKey: "key",
  counter: 0,
});
const device = (id: string): NewCredential => ({ id, kind: "device", label: id });

function family(): { access: Access; store: MemoryAccess } {
  const store = new MemoryAccess();
  const access = accessOver(store);
  expect(
    access.setUp({
      member: { id: member("ann"), name: "Ann" },
      credential: passkey("ann-1"),
      now: start,
      code: "code 1",
    }).ok,
  ).toBe(true);
  return { access, store };
}

/** Invites somebody and lets them in with a credential. */
function joined(
  access: Access,
  name: string,
  role: Role,
  credential: NewCredential = passkey(`${name}-1`),
) {
  const invited = access.invite(member("ann"), {
    id: `inv-${name}`,
    hash: `hash-${name}`,
    role,
    person: null,
    now: start,
    seed: 0,
  });
  expect(invited.ok).toBe(true);
  const done = access.redeem({
    hash: `hash-${name}`,
    now: start + 1,
    member: { id: member(name), name },
    credential,
  });
  expect(done.ok).toBe(true);
}

const refused = (code: string) => ({ ok: false, error: expect.objectContaining({ code }) });

describe("the rights of a role", () => {
  const table: Record<Action, [boolean, boolean, boolean]> = {
    "read-tree": [true, true, true],
    "read-journal": [false, true, true],
    "edit-tree": [false, true, true],
    "undo-and-trash": [false, true, true],
    erase: [false, false, true],
    exchange: [false, false, true],
    "see-members": [true, true, true],
    "manage-members": [false, false, true],
    "own-account": [true, true, true],
  };
  const roles: Role[] = ["reader", "editor", "keeper"];

  for (const [action, cells] of Object.entries(table)) {
    for (const [i, role] of roles.entries()) {
      it(`${role} ${cells[i] ? "may" : "may not"} ${action}`, () => {
        expect(can(role, action as Action)).toBe(cells[i]);
      });
    }
  }

  it("are all in the table", () => {
    expect(() => can("reader", "fly" as Action)).toThrow();
  });
});

describe("setting up", () => {
  it("makes the first keeper, and is closed then unless the code is new", () => {
    const { access } = family();
    expect(access.member(member("ann"))).toMatchObject({
      role: "keeper",
      name: "Ann",
      revokedAt: null,
    });
    const again = {
      member: { id: member("bob"), name: "Bob" },
      credential: passkey("bob-1"),
      now: start,
      code: "code 1",
    };
    expect(access.setUp(again)).toEqual(refused("set-up"));
    expect(access.setUp({ ...again, code: "code 2" }).ok).toBe(true);
    expect(access.member(member("bob"))?.role).toBe("keeper");
    // A new code lets one keeper in, once.
    const third = { ...again, member: { id: member("eve"), name: "Eve" }, code: "code 2" };
    expect(access.setUp({ ...third, credential: passkey("eve-1") })).toEqual(refused("set-up"));
  });

  it("is open while nobody is set up", () => {
    const access = accessOver(new MemoryAccess());
    expect(access.isSetUp()).toBe(false);
    const device1 = {
      member: { id: member("ann"), name: "Ann" },
      credential: device("d"),
      now: start,
      code: "code 1",
    };
    expect(access.setUp(device1)).toEqual(refused("passkey-required"));
    // A code that let nobody in is not used up.
    expect(access.setUp({ ...device1, credential: passkey("p") }).ok).toBe(true);
  });
});

describe("the last keeper", () => {
  it("cannot be lowered, revoked, or delete the account", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    expect(access.changeRole(member("ann"), member("ann"), "editor", start)).toEqual(
      refused("last-keeper"),
    );
    expect(access.revoke(member("ann"), member("ann"), start)).toEqual(refused("last-keeper"));
    expect(access.deleteAccount(member("ann"))).toEqual(refused("last-keeper"));
    expect(access.revokeCredential(member("ann"), "ann-1", start)).toEqual(refused("last-keeper"));
    expect(
      access.recover(member("ann"), { id: "r", hash: "r", member: member("ann"), now: start }),
    ).toEqual(refused("last-keeper"));
    expect(access.member(member("ann"))?.role).toBe("keeper");
  });

  it("is one of two, so either goes, but not both", () => {
    const { access } = family();
    joined(access, "bob", "keeper");
    expect(access.revoke(member("bob"), member("ann"), start).ok).toBe(true);
    expect(access.revoke(member("ann"), member("bob"), start)).toEqual(refused("forbidden"));
    expect(access.changeRole(member("bob"), member("bob"), "reader", start)).toEqual(
      refused("last-keeper"),
    );
  });

  it("needs a live passkey: a keeper without one does not count", () => {
    const { access } = family();
    joined(access, "bob", "keeper");
    expect(
      access.recover(member("ann"), { id: "r", hash: "r", member: member("bob"), now: start }).ok,
    ).toBe(true);
    // Bob has no passkey until he uses the recovery link, so Ann is the last.
    expect(access.deleteAccount(member("ann"))).toEqual(refused("last-keeper"));
  });
});

describe("an invitation", () => {
  it("is given by a keeper only", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    const input = {
      id: "i",
      hash: "h",
      role: "reader" as const,
      person: null,
      now: start,
      seed: 0,
    };
    expect(access.invite(member("bob"), input)).toEqual(refused("forbidden"));
    expect(access.invite(member("ann"), input).ok).toBe(true);
  });

  it("is spent once, and gives its role and person", () => {
    const { access } = family();
    const input = {
      id: "i",
      hash: "h",
      role: "editor" as const,
      person: person("ada"),
      now: start,
      seed: 0,
    };
    expect(access.invite(member("ann"), input).ok).toBe(true);
    const redeem = {
      hash: "h",
      now: start + day,
      member: { id: member("bob"), name: "Bob" },
      credential: passkey("b"),
    };
    expect(access.redeem(redeem).ok).toBe(true);
    expect(access.member(member("bob"))).toMatchObject({ role: "editor", person: person("ada") });
    const twice = {
      ...redeem,
      member: { id: member("eve"), name: "Eve" },
      credential: passkey("e"),
    };
    expect(access.redeem(twice)).toEqual(refused("spent"));
  });

  it("lives 14 days, and a revoked one is gone", () => {
    const { access } = family();
    const input = {
      id: "i",
      hash: "h",
      role: "reader" as const,
      person: null,
      now: start,
      seed: 0,
    };
    expect(access.invite(member("ann"), input).ok).toBe(true);
    const redeem = {
      hash: "h",
      member: { id: member("bob"), name: "Bob" },
      credential: passkey("b"),
    };
    expect(access.redeem({ ...redeem, now: start + 14 * day })).toEqual(refused("expired"));
    expect(access.revokeInvitation(member("ann"), "i").ok).toBe(true);
    expect(access.redeem({ ...redeem, now: start + day })).toEqual(refused("missing"));
  });

  it("is not spent by a credential that is refused", () => {
    const { access } = family();
    const input = {
      id: "i",
      hash: "h",
      role: "editor" as const,
      person: null,
      now: start,
      seed: 0,
    };
    expect(access.invite(member("ann"), input).ok).toBe(true);
    const redeem = { hash: "h", now: start, member: { id: member("bob"), name: "Bob" } };
    expect(access.redeem({ ...redeem, credential: device("d") })).toEqual(
      refused("passkey-required"),
    );
    expect(access.redeem({ ...redeem, credential: passkey("p") }).ok).toBe(true);
  });
});

describe("a link of a keeper who was lowered or revoked since", () => {
  it("lets nobody in", () => {
    const { access } = family();
    joined(access, "bob", "keeper");
    const input = {
      id: "i",
      hash: "h",
      role: "keeper" as const,
      person: null,
      now: start,
      seed: 0,
    };
    expect(access.invite(member("bob"), input).ok).toBe(true);
    expect(access.changeRole(member("ann"), member("bob"), "reader", start).ok).toBe(true);
    const redeem = { hash: "h", now: start, member: { id: member("dan"), name: "Dan" } };
    expect(access.redeem({ ...redeem, credential: passkey("d") })).toEqual(refused("missing"));
    expect(access.member(member("dan"))).toBeNull();
    // Revoked: a recovery link of theirs gives nothing either.
    expect(access.changeRole(member("ann"), member("bob"), "keeper", start).ok).toBe(true);
    joined(access, "eve", "editor");
    const recovery = { id: "r", hash: "r", member: member("eve"), now: start };
    expect(access.recover(member("bob"), recovery).ok).toBe(true);
    expect(access.revoke(member("ann"), member("bob"), start).ok).toBe(true);
    expect(access.redeem({ hash: "r", now: start, credential: passkey("e2") })).toEqual(
      refused("missing"),
    );
  });
});

describe("recovery", () => {
  it("leaves only the last link of a member, and spending it spends the others", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    for (const id of ["r1", "r2"]) {
      const input = { id, hash: id, member: member("bob"), now: start };
      expect(access.recover(member("ann"), input).ok).toBe(true);
    }
    const redeem = { now: start, credential: passkey("bob-2") };
    expect(access.redeem({ ...redeem, hash: "r1" })).toEqual(refused("missing"));
    expect(access.redeem({ ...redeem, hash: "r2" }).ok).toBe(true);
    expect(access.redeem({ ...redeem, hash: "r2", credential: passkey("x") })).toEqual(
      refused("spent"),
    );
  });

  it("revokes the passkeys and sessions of that member only, and lives a day", () => {
    const { access, store } = family();
    joined(access, "bob", "editor");
    joined(access, "eve", "reader");
    for (const [who, credential] of [
      ["bob", "bob-1"],
      ["eve", "eve-1"],
    ] as const) {
      expect(access.signIn({ hash: `s-${who}`, credential, now: start }).ok).toBe(true);
    }
    const recovery = { id: "r", hash: "r", member: member("bob"), now: start };
    expect(access.recover(member("ann"), recovery).ok).toBe(true);
    expect(access.credentialsOf(member("bob")).every(({ revokedAt }) => revokedAt === start)).toBe(
      true,
    );
    expect(access.session("s-bob", start)).toBeNull();
    expect(access.session("s-eve", start)).toMatchObject({ member: member("eve") });
    expect(store.rows.session.has("s-bob")).toBe(false);
    const redeem = { hash: "r", credential: passkey("bob-2") };
    expect(access.redeem({ ...redeem, now: start + day })).toEqual(refused("expired"));
    expect(access.redeem({ ...redeem, now: start + day - 1 }).ok).toBe(true);
    expect(
      access.credentialsOf(member("bob")).filter(({ revokedAt }) => revokedAt === null),
    ).toHaveLength(1);
    expect(access.member(member("bob"))?.role).toBe("editor");
  });
});

describe("a bound device", () => {
  it("is for a reader, one at a time", () => {
    const { access } = family();
    joined(access, "eve", "reader", device("eve-d1"));
    expect(access.addCredential(member("eve"), device("eve-d2"), start)).toEqual(
      refused("one-device"),
    );
    expect(access.revokeCredential(member("ann"), "eve-d1", start).ok).toBe(true);
    expect(access.addCredential(member("eve"), device("eve-d2"), start).ok).toBe(true);
    joined(access, "bob", "editor");
    expect(access.addCredential(member("bob"), device("bob-d"), start)).toEqual(
      refused("passkey-required"),
    );
  });

  it("stays with a reader raised to editor only with a passkey, and goes then", () => {
    const { access } = family();
    joined(access, "eve", "reader", device("eve-d1"));
    expect(access.changeRole(member("ann"), member("eve"), "editor", start)).toEqual(
      refused("passkey-required"),
    );
    expect(access.addCredential(member("eve"), passkey("eve-p"), start).ok).toBe(true);
    expect(access.changeRole(member("ann"), member("eve"), "editor", start).ok).toBe(true);
    const live = access.credentialsOf(member("eve")).filter(({ revokedAt }) => revokedAt === null);
    expect(live.map(({ id }) => id)).toEqual(["eve-p"]);
  });
});

describe("a session", () => {
  it("slides: 30 days for a passkey, 180 for a device", () => {
    const { access } = family();
    joined(access, "eve", "reader", device("eve-d"));
    expect(access.signIn({ hash: "s1", credential: "ann-1", now: start }).ok).toBe(true);
    expect(access.signIn({ hash: "s2", credential: "eve-d", now: start }).ok).toBe(true);
    expect(access.session("s1", start + 29 * day)?.expiresAt).toBe(start + 59 * day);
    expect(access.session("s1", start + 59 * day)).toBeNull();
    expect(access.session("s2", start + 179 * day)?.expiresAt).toBe(start + 359 * day);
  });

  it("is written again at most once a day", () => {
    const { access, store } = family();
    expect(access.signIn({ hash: "s", credential: "ann-1", now: start }).ok).toBe(true);
    const saves = store.saves;
    expect(access.session("s", start + day - 1)?.expiresAt).toBe(start + 30 * day);
    expect(store.saves).toBe(saves);
    expect(access.session("s", start + day)?.expiresAt).toBe(start + 31 * day);
    expect(store.saves).toBe(saves + 1);
  });

  it("ends with its credential, its member, and signing out", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    joined(access, "eve", "reader");
    for (const [hash, credential] of [
      ["s-bob", "bob-1"],
      ["s-eve", "eve-1"],
      ["s-ann", "ann-1"],
    ] as const) {
      expect(access.signIn({ hash, credential, now: start }).ok).toBe(true);
    }
    expect(access.revoke(member("ann"), member("bob"), start).ok).toBe(true);
    expect(access.session("s-bob", start)).toBeNull();
    expect(access.revokeCredential(member("eve"), "eve-1", start).ok).toBe(true);
    expect(access.session("s-eve", start)).toBeNull();
    expect(access.signOut("s-ann").ok).toBe(true);
    expect(access.session("s-ann", start)).toBeNull();
    expect(access.signIn({ hash: "x", credential: "bob-1", now: start })).toEqual(
      refused("missing"),
    );
  });

  it("is not taken for one whose credential or member is revoked, should it be left behind", () => {
    const { access, store } = family();
    joined(access, "bob", "editor");
    expect(access.signIn({ hash: "s", credential: "bob-1", now: start }).ok).toBe(true);
    const credential = store.rows.credential.get("bob-1");
    if (credential === undefined) throw new Error("no credential");
    store.rows.credential.set("bob-1", { ...credential, revokedAt: start });
    expect(access.session("s", start)).toBeNull();
    store.rows.credential.set("bob-1", credential);
    const bob = store.rows.member.get(member("bob"));
    if (bob === undefined) throw new Error("no member");
    store.rows.member.set(member("bob"), { ...bob, revokedAt: start });
    expect(access.session("s", start)).toBeNull();
  });

  it("is not taken over by another with the same token", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    expect(access.signIn({ hash: "s", credential: "ann-1", now: start }).ok).toBe(true);
    expect(access.signIn({ hash: "s", credential: "bob-1", now: start })).toEqual(
      refused("duplicate"),
    );
    expect(access.session("s", start)?.member).toBe(member("ann"));
  });

  it("says who it is, the role and the person", () => {
    const { access } = family();
    expect(access.signIn({ hash: "s", credential: "ann-1", now: start }).ok).toBe(true);
    expect(access.session("s", start)).toMatchObject({
      member: member("ann"),
      role: "keeper",
      person: null,
    });
  });
});

describe("a member", () => {
  it("revokes only their own credentials, and a keeper anybody's", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    joined(access, "eve", "reader");
    expect(access.revokeCredential(member("bob"), "eve-1", start)).toEqual(refused("forbidden"));
    expect(access.revokeCredential(member("ann"), "eve-1", start).ok).toBe(true);
  });

  it("deletes the account with its credentials and sessions", () => {
    const { access, store } = family();
    joined(access, "bob", "editor");
    expect(access.signIn({ hash: "s", credential: "bob-1", now: start }).ok).toBe(true);
    expect(access.deleteAccount(member("bob")).ok).toBe(true);
    expect(access.member(member("bob"))).toBeNull();
    expect(store.rows.credential.has("bob-1")).toBe(false);
    expect(store.rows.session.has("s")).toBe(false);
  });

  it("revoked cannot act, and is not revoked twice", () => {
    const { access } = family();
    joined(access, "bob", "keeper");
    expect(access.revoke(member("ann"), member("bob"), start).ok).toBe(true);
    expect(
      access.invite(member("bob"), {
        id: "i",
        hash: "h",
        role: "reader",
        person: null,
        now: start,
        seed: 0,
      }),
    ).toEqual(refused("forbidden"));
    expect(access.revoke(member("ann"), member("bob"), start)).toEqual(refused("missing"));
  });
});

describe("a step of signing in", () => {
  const open = (store: MemoryAccess, now: number) =>
    store.save(openChallenge({ hash: "h", purpose: "login", challenge: "c" }, now));

  it("is answered once, by its purpose, within five minutes", () => {
    const store = new MemoryAccess();
    open(store, start);
    const late = takeChallenge(store, "h", "login", start + 5 * 60_000);
    expect(late.taken).toEqual(refused("expired"));
    store.save(late.change);
    expect(takeChallenge(store, "h", "login", start).taken).toEqual(refused("missing"));
    open(store, start);
    const other = takeChallenge(store, "h", "setup", start);
    expect(other.taken).toEqual(refused("missing"));
    store.save(other.change);
    expect(store.rows.challenge.size).toBe(0);
    open(store, start);
    const done = takeChallenge(store, "h", "login", start + 5 * 60_000 - 1);
    expect(done.taken).toMatchObject({ ok: true, value: { challenge: "c" } });
  });
});

describe("a passkey that signs in", () => {
  it("counts on, and one that counts the same or back is refused", () => {
    const { access } = family();
    expect(access.signIn({ hash: "s1", credential: "ann-1", now: start, counter: 5 }).ok).toBe(
      true,
    );
    for (const counter of [5, 4]) {
      expect(
        access.signIn({ hash: `s${counter}x`, credential: "ann-1", now: start, counter }),
      ).toEqual(refused("stale-counter"));
    }
    expect(access.signIn({ hash: "s2", credential: "ann-1", now: start, counter: 6 }).ok).toBe(
      true,
    );
  });
});

describe("one more passkey", () => {
  it("is proven by a live passkey of the same account, whose count goes on", () => {
    const { access } = family();
    joined(access, "bob", "editor");
    const make = passkey("bob-2");
    // Another member's passkey proves nothing of this account.
    expect(
      access.addPasskey(member("bob"), make, start, { credential: "ann-1", counter: 1 }),
    ).toEqual(refused("passkey-required"));
    expect(
      access.addPasskey(member("bob"), make, start, { credential: "bob-1", counter: 3 }).ok,
    ).toBe(true);
    expect(access.credentialsOf(member("bob")).find(({ id }) => id === "bob-1")?.counter).toBe(3);
    // The same count again is a copy of the passkey, or a replay.
    expect(
      access.addPasskey(member("bob"), passkey("bob-3"), start, {
        credential: "bob-1",
        counter: 3,
      }),
    ).toEqual(refused("stale-counter"));
    expect(access.revokeCredential(member("bob"), "bob-1", start).ok).toBe(true);
    expect(
      access.addPasskey(member("bob"), passkey("bob-4"), start, {
        credential: "bob-1",
        counter: 9,
      }),
    ).toEqual(refused("passkey-required"));
  });

  it("is never made by a browser a reader linked", () => {
    const { access } = family();
    joined(access, "eve", "reader", device("eve-d"));
    expect(access.provers(member("eve"))).toEqual(refused("passkey-required"));
    expect(
      access.addPasskey(member("eve"), passkey("eve-p"), start, {
        credential: "eve-d",
        counter: 1,
      }),
    ).toEqual(refused("passkey-required"));
    expect(access.account(member("eve"))).toMatchObject({
      ok: true,
      value: { canAddPasskey: false },
    });
  });

  it("counts on from nothing, and never back", () => {
    const { access } = family();
    expect(access.signIn({ hash: "s0", credential: "ann-1", now: start, counter: 0 }).ok).toBe(
      true,
    );
    expect(access.signIn({ hash: "s1", credential: "ann-1", now: start, counter: 0 }).ok).toBe(
      true,
    );
    expect(access.signIn({ hash: "s2", credential: "ann-1", now: start, counter: 2 }).ok).toBe(
      true,
    );
    expect(access.signIn({ hash: "s3", credential: "ann-1", now: start, counter: 1 })).toEqual(
      refused("stale-counter"),
    );
  });
});

describe("a nickname", () => {
  const link = (id: string, extra: { name?: string } = {}) => ({
    id,
    hash: id,
    role: "reader" as const,
    person: null,
    now: start,
    seed: 0,
    ...extra,
  });

  it("is one nobody in the family has", () => {
    const { access, store } = family();
    expect(access.invite(member("ann"), link("a")).ok).toBe(true);
    expect(access.invite(member("ann"), link("b")).ok).toBe(true);
    const nicknames = ["a", "b"].map((id) => store.invitation(id)?.nickname);
    expect(nicknames[0]).not.toBeNull();
    expect(nicknames[0]).not.toEqual(nicknames[1]);
  });

  it("with none left is refused by its own code, and a name still lets somebody in", () => {
    const { store } = family();
    const given = invite(store, member("ann"), link("first"));
    if (!given.ok) throw new Error("no invitation");
    store.save(given.value);
    const first = store.invitation("first");
    if (first === null) throw new Error("no invitation");
    // Every other pair goes to a link of its own, at once.
    const all = NICKNAME_ADJECTIVES.flatMap((adjective) =>
      NICKNAME_CREATURES.map((creature) => ({ adjective, creature })),
    ).filter(({ adjective, creature }) => {
      const { nickname } = first;
      return adjective !== nickname?.adjective || creature !== nickname.creature;
    });
    store.save(
      all.flatMap((nickname, i) => {
        const id = `i${i}`;
        return writes("invitation", id, null, { ...first, id, hash: id, nickname });
      }),
    );
    expect(invite(store, member("ann"), link("over"))).toEqual(refused("nicknames-spent"));
    expect(invite(store, member("ann"), link("named", { name: "Vera" })).ok).toBe(true);
  });

  it("stays taken by a revoked member, whom a keeper still sees, and not by a spent link", () => {
    const { access, store } = family();
    expect(access.invite(member("ann"), link("a")).ok).toBe(true);
    const redeem = {
      hash: "a",
      now: start,
      member: { id: member("bob"), name: "" },
      credential: passkey("b"),
    };
    expect(access.redeem(redeem).ok).toBe(true);
    const nickname = access.member(member("bob"))?.nickname;
    if (nickname == null) throw new Error("no nickname");
    expect(access.revoke(member("ann"), member("bob"), start).ok).toBe(true);
    const only = { adjectives: [nickname.adjective], creatures: [nickname.creature] };
    expect(nicknameFor(store, 0, only)).toBeNull();
  });

  it("is chosen from what is free, by the seed", () => {
    const { store: reader } = family();
    const words = { adjectives: ["brave", "sly"], creatures: ["owl"] };
    expect(nicknameFor(reader, 0, words)).toEqual({ adjective: "brave", creature: "owl" });
    expect(nicknameFor(reader, 1, words)).toEqual({ adjective: "sly", creature: "owl" });
    expect(nicknameFor(reader, 7, { adjectives: [], creatures: ["owl"] })).toBeNull();
  });

  it("is made of the words the browser knows: its copy of the lists is the domain's", () => {
    expect([...SHARED_ADJECTIVES]).toEqual([...NICKNAME_ADJECTIVES]);
    expect([...SHARED_CREATURES]).toEqual([...NICKNAME_CREATURES]);
  });
});

describe("a name", () => {
  it("written blank is refused as a name required", () => {
    const { access } = family();
    expect(access.rename(member("ann"), "  ")).toEqual(refused("name-required"));
    expect(access.rename(member("ann"), " Anna ").ok).toBe(true);
    expect(access.member(member("ann"))).toMatchObject({ name: "Anna", nickname: null });
  });

  it("may be left unwritten on joining only where the link has a name or a nickname", () => {
    const { access, store } = family();
    expect(access.invite(member("ann"), { ...invitation("named"), name: "Vera" }).ok).toBe(true);
    expect(access.invite(member("ann"), invitation("nicknamed")).ok).toBe(true);
    // A link written before links had names or nicknames.
    const old = store.invitation("nicknamed");
    if (old === null) throw new Error("no invitation");
    store.save(
      writes("invitation", "old", null, { ...old, id: "old", hash: "old", nickname: null }),
    );
    const optional = (hash: string) => {
      const found = access.inspect(hash, start);
      return found.ok ? found.value.nameOptional : null;
    };
    expect(optional("named")).toBe(true);
    expect(optional("nicknamed")).toBe(true);
    expect(optional("old")).toBe(false);
    expect(access.newcomer("old", start, { id: member("eve"), name: "" })).toEqual(
      refused("missing"),
    );
  });

  const invitation = (id: string) => ({
    id,
    hash: id,
    role: "reader" as const,
    person: null,
    now: start,
    seed: 0,
  });
});
