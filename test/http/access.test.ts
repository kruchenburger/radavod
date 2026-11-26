import { describe, expect, it } from "vitest";
import { type Browser, Family, SETUP_CODE } from "./family";

const month = 30 * 86_400;

/** Whether a browser is signed in, as the app asks whenever it opens. */
const signedIn = async (browser: Browser): Promise<boolean> => {
  const { status, body } = await browser.json("GET", "/api/session");
  expect(status).toBe(200);
  return body !== null;
};

describe("setting a family up", () => {
  it("makes the first keeper with a passkey, and signs them in with the cookie of the spec", async () => {
    const ann = new Family().browser();
    const done = await ann.setUp("Ann", "Oaks");
    expect(done).toMatchObject({
      status: 200,
      body: { name: "Ann", role: "keeper", family: "Oaks", person: null },
    });
    expect(ann.lastSetCookie).toMatch(
      new RegExp(
        `^__Host-session=[A-Za-z0-9_-]{43}; Max-Age=${month}; Path=/; HttpOnly; Secure; SameSite=Lax$`,
        "u",
      ),
    );
    expect((await ann.json("GET", "/api/session")).body).toMatchObject({
      name: "Ann",
      role: "keeper",
    });
  });

  it("is closed once a keeper exists, a wrong code and a used one alike, and opens once for a new code", async () => {
    const family = new Family();
    expect((await family.browser().setUp()).status).toBe(200);
    for (const code of [SETUP_CODE, "a guess"]) {
      const again = await family.browser().json("POST", "/api/setup/options", {
        body: { code, family: "x", name: "Eve" },
      });
      expect(again).toEqual({ status: 403, body: { error: "setup-refused" } });
    }
    const renewed = new Family({ SETUP_CODE: "a second setup code for tests" });
    Object.assign(renewed.env, { ACCESS: family.env.ACCESS });
    expect(
      (await renewed.browser().setUp("Bob", "x", "a second setup code for tests")).body,
    ).toMatchObject({
      role: "keeper",
      family: "Oaks",
    });
    const third = await renewed.browser().json("POST", "/api/setup/options", {
      body: { code: "a second setup code for tests", family: "x", name: "Eve" },
    });
    expect(third.status).toBe(403);
  });

  it("is not there without a setup code, and counts guesses by address", async () => {
    for (const SETUP_CODE of ["", "too short a code"]) {
      const closed = new Family({ SETUP_CODE });
      const none = await closed.browser().json("POST", "/api/setup/options", {
        body: { code: SETUP_CODE || "x", family: "x", name: "x" },
      });
      expect(none).toEqual({ status: 403, body: { error: "setup-refused" } });
    }
    const family = new Family();
    const guesser = family.browser();
    for (let i = 0; i < 10; i++) {
      const guess = await guesser.call("POST", "/api/setup/options", {
        body: { code: `guess ${i}`, family: "x", name: "x" },
      });
      expect(guess.status).toBe(403);
    }
    const limited = await guesser.call("POST", "/api/setup/options", {
      body: { code: SETUP_CODE, family: "x", name: "x" },
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    const elsewhere = await guesser.call("POST", "/api/setup/options", {
      body: { code: SETUP_CODE, family: "x", name: "x" },
      address: "192.0.2.99",
    });
    expect(elsewhere.status).toBe(200);
  });
});

describe("a step of signing in", () => {
  it("is refused when the setup code changed while the passkey was made", async () => {
    const family = new Family();
    const browser = family.browser();
    const options = await browser.json<{ flow: string; options: never }>(
      "POST",
      "/api/setup/options",
      { body: { code: SETUP_CODE, family: "x", name: "Ann" } },
    );
    const response = await browser.passkey.register(options.body.options);
    Object.assign(family.env, { SETUP_CODE: "a second setup code for tests" });
    const done = await browser.json("POST", "/api/setup/verify", {
      body: { flow: options.body.flow, response },
    });
    expect(done).toEqual({ status: 403, body: { error: "setup-refused" } });
  });

  it("comes from the site itself on every open route", async () => {
    const browser = new Family().browser();
    for (const path of [
      "/api/setup/options",
      "/api/setup/verify",
      "/api/invitation",
      "/api/passkey/register/options",
      "/api/passkey/register/verify",
      "/api/passkey/login/options",
      "/api/passkey/login/verify",
      "/api/device/bind",
    ]) {
      for (const origin of ["https://elsewhere.test", null]) {
        const response = await browser.json("POST", path, { body: {}, origin });
        expect(response, `${path} ${origin}`).toEqual({ status: 403, body: { error: "origin" } });
      }
    }
  });

  it("is answered once", async () => {
    const browser = new Family().browser();
    const options = await browser.json<{ flow: string; options: never }>(
      "POST",
      "/api/setup/options",
      {
        body: { code: SETUP_CODE, family: "x", name: "Ann" },
      },
    );
    const response = await browser.passkey.register(options.body.options);
    const body = { flow: options.body.flow, response };
    expect((await browser.call("POST", "/api/setup/verify", { body })).status).toBe(200);
    expect(await browser.json("POST", "/api/setup/verify", { body })).toEqual({
      status: 410,
      body: { error: "step-over" },
    });
  });

  it("refuses a passkey made for another site, and is spent by it", async () => {
    const browser = new Family().browser();
    const options = await browser.json<{ flow: string; options: never }>(
      "POST",
      "/api/setup/options",
      {
        body: { code: SETUP_CODE, family: "x", name: "Ann" },
      },
    );
    const response = await browser.passkey.register(options.body.options, "https://elsewhere.test");
    const body = { flow: options.body.flow, response };
    expect((await browser.json("POST", "/api/setup/verify", { body })).body).toEqual({
      error: "passkey-refused",
    });
    expect((await browser.call("POST", "/api/setup/verify", { body })).status).toBe(410);
  });
});

describe("signing in", () => {
  it("works with the passkey, and says nothing of why it fails", async () => {
    const family = new Family();
    const ann = family.browser();
    await ann.setUp();
    const later = family.browser();
    Object.assign(later, { passkey: ann.passkey });
    expect((await later.signIn()).body).toMatchObject({ name: "Ann", role: "keeper" });
    const stranger = family.browser();
    await stranger.passkey.register({ challenge: "x", user: { id: "x" } });
    expect(await stranger.signIn()).toEqual({ status: 401, body: { error: "sign-in-refused" } });
  });

  it("is refused from another origin, and a session cookie is refused from another site", async () => {
    const { keeper } = await Family.withRoles();
    const foreign = await keeper.call("POST", "/api/members/invitations", {
      body: { role: "reader", person: null },
      origin: "https://elsewhere.test",
    });
    expect(foreign.status).toBe(403);
    const none = await keeper.call("POST", "/api/members/invitations", {
      body: { role: "reader", person: null },
      origin: null,
    });
    expect(none.status).toBe(403);
    expect((await keeper.call("GET", "/api/session", { origin: null })).status).toBe(200);
  });

  it("says the same of a passkey turned off as of a wrong one", async () => {
    const { family, keeper, editor } = await Family.withRoles();
    const own = await editor.json<{ credentials: { id: string }[] }>("GET", "/api/account");
    const [credential] = own.body.credentials;
    expect((await keeper.call("POST", `/api/credentials/${credential?.id}/revoke`)).status).toBe(
      204,
    );
    const again = family.browser();
    Object.assign(again, { passkey: editor.passkey });
    expect(await again.signIn()).toEqual({ status: 401, body: { error: "sign-in-refused" } });
  });

  it("refuses a passkey that counts back, as a copy of it would", async () => {
    const family = new Family();
    const ann = family.browser();
    await ann.setUp();
    expect((await ann.signIn()).status).toBe(200);
    ann.passkey.rewind();
    expect(await ann.signIn()).toEqual({ status: 401, body: { error: "sign-in-refused" } });
  });

  it("counts an IPv6 household by its /64, and binding a device too", async () => {
    const browser = new Family().browser();
    for (let i = 0; i < 10; i++) {
      const address = `2001:db8:1:2::${(i + 1).toString(16)}`;
      const options = await browser.call("POST", "/api/passkey/login/options", { address });
      expect(options.status).toBe(200);
    }
    const bind = await browser.call("POST", "/api/device/bind", {
      body: { secret: "A".repeat(43), name: "x", label: "x" },
      address: "2001:0db8:0001:0002:ffff::1",
    });
    expect(bind.status).toBe(429);
    const other = await browser.call("POST", "/api/passkey/login/options", {
      address: "2001:db8:1:3::1",
    });
    expect(other.status).toBe(200);
  });

  it("is limited to ten tries in a quarter of an hour by address", async () => {
    const browser = new Family().browser();
    for (let i = 0; i < 10; i++) {
      expect((await browser.call("POST", "/api/passkey/login/options")).status).toBe(200);
    }
    const limited = await browser.call("POST", "/api/passkey/login/options");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });

  it("logs the country, and the log is the keeper's", async () => {
    const family = new Family();
    const ann = family.browser();
    await ann.setUp();
    const options = await ann.json<{ flow: string; options: never }>(
      "POST",
      "/api/passkey/login/options",
    );
    const response = await ann.passkey.signIn(options.body.options);
    await ann.call("POST", "/api/passkey/login/verify", {
      body: { flow: options.body.flow, response },
      country: "DE",
    });
    const log = await ann.json<{ log: { kind: string; country: string | null }[] }>(
      "GET",
      "/api/members/log",
    );
    expect(log.body.log.map(({ kind, country }) => [kind, country])).toContainEqual([
      "sign-in",
      "DE",
    ]);
  });
});

describe("an invitation", () => {
  it("tells its role and family, is not spent by opening, and is spent by a passkey", async () => {
    const { family, keeper } = await Family.withRoles();
    const secret = await keeper.invite("editor");
    const eve = family.browser();
    for (let i = 0; i < 2; i++) {
      expect(await eve.json("POST", "/api/invitation", { body: { secret } })).toMatchObject({
        status: 200,
        body: {
          kind: "join",
          role: "editor",
          family: "Oaks",
          canLink: false,
          name: null,
          nameOptional: true,
        },
      });
    }
    expect((await eve.join(secret, "Eve")).body).toMatchObject({ name: "Eve", role: "editor" });
    expect(
      (await family.browser().json("POST", "/api/invitation", { body: { secret } })).status,
    ).toBe(410);
    expect((await family.browser().join(secret, "Dan")).status).toBe(410);
  });

  it("is not spent by a passkey a browser failed to make", async () => {
    const { family, keeper } = await Family.withRoles();
    const secret = await keeper.invite("editor");
    const eve = family.browser();
    const options = await eve.json<{ flow: string; options: never }>(
      "POST",
      "/api/passkey/register/options",
      { body: { secret, name: "Eve" } },
    );
    const response = await eve.passkey.register(options.body.options, "https://elsewhere.test");
    const failed = await eve.json("POST", "/api/passkey/register/verify", {
      body: { flow: options.body.flow, response },
    });
    expect(failed).toEqual({ status: 400, body: { error: "passkey-refused" } });
    expect((await eve.join(secret, "Eve")).status).toBe(200);
  });

  it("binds one device of a reader, for 180 days, and no device of an editor", async () => {
    const { family, keeper } = await Family.withRoles();
    const reader = family.browser();
    const bound = await reader.json("POST", "/api/device/bind", {
      body: { secret: await keeper.invite("reader"), name: "Gran", label: "tablet" },
    });
    expect(bound.body).toMatchObject({ name: "Gran", role: "reader" });
    expect(reader.lastSetCookie).toContain(`Max-Age=${180 * 86_400};`);
    const editor = await family.browser().json("POST", "/api/device/bind", {
      body: { secret: await keeper.invite("editor"), name: "Ed", label: "tablet" },
    });
    expect(editor).toEqual({ status: 409, body: { error: "passkey-required" } });
  });

  it("lets a keeper see a lost device in the log and revoke it, touching nothing else", async () => {
    const { family, keeper, editor } = await Family.withRoles();
    const gran = family.browser();
    await gran.call("POST", "/api/device/bind", {
      body: { secret: await keeper.invite("reader"), name: "Gran", label: "tablet" },
      country: "PL",
    });
    const log = await keeper.json<{ log: { credential: string; country: string | null }[] }>(
      "GET",
      "/api/members/log",
    );
    const device = log.body.log.find(({ credential }) => credential.startsWith("device_"));
    expect(device?.country).toBe("PL");
    const revoked = await keeper.call("POST", `/api/credentials/${device?.credential}/revoke`);
    expect(revoked.status).toBe(204);
    expect(await signedIn(gran)).toBe(false);
    expect(await signedIn(editor)).toBe(true);
  });

  it("brings an account back, and the old sign-ins of that member only end", async () => {
    const { family, keeper, editor, reader } = await Family.withRoles();
    const session = await editor.json<{ member: string }>("GET", "/api/session");
    const link = await keeper.json<{ secret: string }>(
      "POST",
      `/api/members/${session.body.member}/recovery`,
    );
    expect(link.status).toBe(201);
    expect(await signedIn(editor)).toBe(false);
    expect(await signedIn(reader)).toBe(true);
    const back = family.browser();
    const options = await back.json<{ flow: string; options: never }>(
      "POST",
      "/api/passkey/register/options",
      {
        body: { secret: link.body.secret },
      },
    );
    const response = await back.passkey.register(options.body.options);
    const done = await back.json("POST", "/api/passkey/register/verify", {
      body: { flow: options.body.flow, response },
    });
    expect(done.body).toMatchObject({ member: session.body.member, role: "editor" });
  });
});

describe("a name for whom a link lets in", () => {
  type Answer = { name: string; nickname: { adjective: string; creature: string } | null };

  it("is the keeper's, written in the field, and the person may change it", async () => {
    const { family, keeper } = await Family.withRoles();
    const secret = await keeper.invite("reader", "Aunt Vera");
    const vera = family.browser();
    const opened = await vera.json<Answer>("POST", "/api/invitation", { body: { secret } });
    expect(opened.body).toMatchObject({ name: "Aunt Vera", nickname: null, nameOptional: true });
    // Nothing written: the keeper's name stands.
    const options = await vera.json<{ flow: string; options: never }>(
      "POST",
      "/api/passkey/register/options",
      { body: { secret } },
    );
    const response = await vera.passkey.register(options.body.options);
    const joined = await vera.json<Answer>("POST", "/api/passkey/register/verify", {
      body: { flow: options.body.flow, response },
    });
    expect(joined.body).toMatchObject({ name: "Aunt Vera", nickname: null });
    const other = family.browser();
    const renamed = await other.join(await keeper.invite("reader", "Uncle Ivan"), "Ivan");
    expect(renamed.body).toMatchObject({ name: "Ivan", nickname: null });
  });

  it("is a nickname nobody has when the keeper gives none, until the person writes a name", async () => {
    const { family, keeper } = await Family.withRoles();
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const secret = await keeper.invite("reader");
      const { body } = await keeper.json<Answer>("POST", "/api/invitation", { body: { secret } });
      expect(body.name).toBeNull();
      expect(body.nickname).not.toBeNull();
      seen.add(JSON.stringify(body.nickname));
    }
    expect(seen.size).toBe(5);
    const secret = await keeper.invite("editor");
    const dino = family.browser();
    const { body: link } = await dino.json<Answer>("POST", "/api/invitation", { body: { secret } });
    expect(link).toMatchObject({ name: null, nameOptional: true });
    const options = await dino.json<{ flow: string; options: { user: { name: string } } }>(
      "POST",
      "/api/passkey/register/options",
      { body: { secret } },
    );
    // The passkey is called by the nickname, by its keys: the phone shows no empty account.
    const { adjective, creature } = link.nickname ?? { adjective: "", creature: "" };
    expect(options.body.options.user.name).toBe(`${adjective} ${creature}`);
    const response = await dino.passkey.register(options.body.options as never);
    const joined = await dino.json<Answer>("POST", "/api/passkey/register/verify", {
      body: { flow: options.body.flow, response },
    });
    expect(joined.body).toMatchObject({ name: "", nickname: link.nickname });
    expect((await dino.call("POST", "/api/account/name", { body: { name: "Dina" } })).status).toBe(
      204,
    );
    expect((await dino.json<Answer>("GET", "/api/session")).body).toMatchObject({
      name: "Dina",
      nickname: null,
    });
    expect((await dino.json("POST", "/api/account/name", { body: { name: " " } })).status).toBe(
      400,
    );
  });
});

describe("one's own account", () => {
  it("shows its passkeys without keys, and takes one more passkey proven by one of them", async () => {
    const { family, editor, keeper } = await Family.withRoles();
    const own = await editor.json<{ member: { name: string }; credentials: object[] }>(
      "GET",
      "/api/account",
    );
    expect(own.body.member).toMatchObject({ name: "editor", role: "editor" });
    expect(own.body.credentials).toHaveLength(1);
    expect(JSON.stringify(own.body)).not.toMatch(/publicKey|counter/u);
    const second = family.browser();
    const options = await editor.json<{ flow: string; options: never; proof: never }>(
      "POST",
      "/api/passkey/add/options",
    );
    const response = await second.passkey.register(options.body.options);
    // A keeper's passkey signs well, and proves nothing of the editor's account.
    const unproven = await editor.json("POST", "/api/passkey/add/verify", {
      body: {
        flow: options.body.flow,
        response,
        proof: await keeper.passkey.signIn(options.body.proof),
      },
    });
    expect(unproven).toEqual({ status: 409, body: { error: "passkey-required" } });
    const again = await editor.json<{ flow: string; options: never; proof: never }>(
      "POST",
      "/api/passkey/add/options",
    );
    const proof = await editor.passkey.signIn(again.body.proof);
    const made = await second.passkey.register(again.body.options);
    const added = await editor.call("POST", "/api/passkey/add/verify", {
      body: { flow: again.body.flow, response: made, proof, label: "laptop" },
    });
    expect(added.status).toBe(201);
    expect(
      (await editor.json<{ credentials: object[] }>("GET", "/api/account")).body.credentials,
    ).toHaveLength(2);
    Object.assign(second, { cookie: null });
    expect((await second.signIn()).body).toMatchObject({ name: "editor", via: "passkey" });
  });

  it("makes no passkey for a browser a reader linked", async () => {
    const { family, keeper } = await Family.withRoles();
    const gran = family.browser();
    await gran.call("POST", "/api/device/bind", {
      body: { secret: await keeper.invite("reader"), name: "Gran", label: "tablet" },
    });
    expect(await gran.json("POST", "/api/passkey/add/options")).toEqual({
      status: 409,
      body: { error: "passkey-required" },
    });
  });

  it("does not let another member finish a step begun by somebody else", async () => {
    const { family, editor, reader } = await Family.withRoles();
    const options = await editor.json<{ flow: string; options: never; proof: never }>(
      "POST",
      "/api/passkey/add/options",
    );
    const proof = await editor.passkey.signIn(options.body.proof);
    const response = await family.browser().passkey.register(options.body.options);
    const stolen = await reader.json("POST", "/api/passkey/add/verify", {
      body: { flow: options.body.flow, response, proof },
    });
    expect(stolen).toEqual({ status: 400, body: { error: "bad-request" } });
  });
});

describe("the routes of members", () => {
  const table: [string, string, unknown, Record<"reader" | "editor" | "keeper", number>][] = [
    ["GET", "/api/members", undefined, { reader: 200, editor: 200, keeper: 200 }],
    [
      "POST",
      "/api/members/invitations",
      { role: "reader", person: null },
      { reader: 403, editor: 403, keeper: 201 },
    ],
    ["GET", "/api/members/log", undefined, { reader: 403, editor: 403, keeper: 200 }],
    [
      "DELETE",
      "/api/members/invitations/nothing",
      undefined,
      { reader: 403, editor: 403, keeper: 404 },
    ],
    [
      "POST",
      "/api/members/member_1111111111111111111111/role",
      { role: "reader", version: 0 },
      { reader: 403, editor: 403, keeper: 404 },
    ],
    [
      "POST",
      "/api/members/member_1111111111111111111111/revoke",
      { version: 0 },
      { reader: 403, editor: 403, keeper: 404 },
    ],
    [
      "POST",
      "/api/members/member_1111111111111111111111/recovery",
      undefined,
      { reader: 403, editor: 403, keeper: 404 },
    ],
    [
      "POST",
      "/api/credentials/nothing/revoke",
      undefined,
      { reader: 404, editor: 404, keeper: 404 },
    ],
    ["GET", "/api/people", undefined, { reader: 404, editor: 404, keeper: 404 }],
  ];

  it("admit the roles of the table", async () => {
    const browsers = await Family.withRoles();
    for (const [method, path, body, statuses] of table) {
      for (const role of ["reader", "editor", "keeper"] as const) {
        const response = await browsers[role].call(
          method,
          path,
          body === undefined ? {} : { body },
        );
        expect(response.status, `${role} ${method} ${path}`).toBe(statuses[role]);
      }
    }
  });

  it("answer 401 to everybody without a session, who is told so", async () => {
    const stranger = new Family().browser();
    expect(await stranger.json("GET", "/api/session")).toEqual({ status: 200, body: null });
    for (const [method, path, body] of table) {
      const response = await stranger.call(method, path, body === undefined ? {} : { body });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
    for (const [method, path] of [
      ["POST", "/api/logout"],
      ["DELETE", "/api/account"],
    ] as const) {
      expect((await stranger.call(method, path)).status).toBe(401);
    }
  });

  it("show names to everybody and credentials to keepers", async () => {
    const { reader, keeper } = await Family.withRoles();
    const seen = await reader.json<{ members: object[] }>("GET", "/api/members");
    expect(seen.body.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Ann", role: "keeper" })]),
    );
    expect(Object.keys(seen.body)).toEqual(["members"]);
    expect(seen.body.members.every((one) => !("credentials" in one))).toBe(true);
    const all = await keeper.json<{ members: { credentials: object[] }[]; invitations: object[] }>(
      "GET",
      "/api/members",
    );
    expect(all.body.members.every(({ credentials }) => credentials.length > 0)).toBe(true);
    expect(JSON.stringify(all.body)).not.toMatch(/publicKey|"hash"/u);
  });

  it("leave one keeper when two keepers revoke each other at once", async () => {
    const { family, keeper } = await Family.withRoles();
    const bob = family.browser();
    expect((await bob.join(await keeper.invite("keeper"), "Bob")).status).toBe(200);
    const ids = await Promise.all(
      [keeper, bob].map(
        async (one) => (await one.json<{ member: string }>("GET", "/api/session")).body.member,
      ),
    );
    const [ann, other] = ids as [string, string];
    const both = await Promise.all([
      keeper.call("POST", `/api/members/${other}/revoke`, { body: { version: 1 } }),
      bob.call("POST", `/api/members/${ann}/revoke`, { body: { version: 1 } }),
    ]);
    // The second is refused: by the gate if the first came first, else by the rules.
    const statuses = both.map(({ status }) => status);
    expect(statuses.filter((status) => status === 204)).toHaveLength(1);
    expect(statuses.filter((status) => status === 401 || status === 403)).toHaveLength(1);
    const left = await Promise.all([keeper, bob].map(signedIn));
    expect(left.sort()).toEqual([false, true]);
  });

  it("keep the last keeper whatever is asked", async () => {
    const { keeper } = await Family.withRoles();
    const { body } = await keeper.json<{ member: string }>("GET", "/api/session");
    const lowered = await keeper.json("POST", `/api/members/${body.member}/role`, {
      body: { role: "editor", version: 1 },
    });
    expect(lowered).toEqual({ status: 409, body: { error: "last-keeper" } });
    expect((await keeper.json("DELETE", "/api/account")).status).toBe(409);
  });

  it("let a member sign out and delete the account", async () => {
    const { family, editor } = await Family.withRoles();
    const cookie = editor.cookie;
    expect((await editor.call("POST", "/api/logout")).status).toBe(204);
    expect(editor.lastSetCookie).toMatch(/^__Host-session=; Max-Age=0;/u);
    const old = family.browser();
    old.cookie = cookie;
    expect(await signedIn(old)).toBe(false);
    expect((await editor.signIn()).status).toBe(200);
    expect((await editor.call("DELETE", "/api/account")).status).toBe(204);
    expect(await signedIn(editor)).toBe(false);
  });
});
