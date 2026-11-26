import { env } from "cloudflare:test";
import { expect } from "vitest";
import { app } from "../../src/worker/app";
import type { Env } from "../../src/worker/env";
import { Authenticator } from "./authenticator";

export const ORIGIN = "https://family.test";
export const RP_ID = "family.test";
export const SETUP_CODE = "a setup code for tests";

type Init = { body?: unknown; origin?: string | null; address?: string; country?: string };

/** A browser of one relative: its cookie and its passkey. */
export class Browser {
  cookie: string | null = null;
  readonly passkey = new Authenticator(ORIGIN, RP_ID);
  lastSetCookie: string | null = null;

  readonly family: Family;

  constructor(family: Family) {
    this.family = family;
  }

  async call(method: string, path: string, init: Init = {}): Promise<Response> {
    const headers = new Headers({ "content-type": "application/json" });
    const origin = init.origin === undefined ? ORIGIN : init.origin;
    if (origin !== null) headers.set("origin", origin);
    if (this.cookie !== null) headers.set("cookie", this.cookie);
    headers.set("cf-connecting-ip", init.address ?? "192.0.2.1");
    const request = new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.country === undefined ? {} : { cf: { country: init.country } }),
    });
    const response = await app.request(request, undefined, this.family.env);
    const set = response.headers.get("set-cookie");
    if (set !== null) {
      this.lastSetCookie = set;
      const [pair = ""] = set.split(";");
      this.cookie = pair.endsWith("=") ? null : pair;
    }
    return response;
  }

  async json<T = Record<string, unknown>>(method: string, path: string, init: Init = {}) {
    const response = await this.call(method, path, init);
    return { status: response.status, body: (await response.json().catch(() => null)) as T };
  }

  /** Sets a family up with this browser's passkey. */
  async setUp(name = "Ann", family = "Oaks", code = SETUP_CODE) {
    const options = await this.json<{ flow: string; options: never }>(
      "POST",
      "/api/setup/options",
      {
        body: { code, family, name },
      },
    );
    expect(options.status).toBe(200);
    const response = await this.passkey.register(options.body.options);
    return this.json("POST", "/api/setup/verify", {
      body: { flow: options.body.flow, response, label: "phone" },
    });
  }

  /** Joins by an invitation with a passkey. */
  async join(secret: string, name: string) {
    const options = await this.json<{ flow: string; options: never }>(
      "POST",
      "/api/passkey/register/options",
      { body: { secret, name } },
    );
    if (options.status !== 200) return options;
    const response = await this.passkey.register(options.body.options);
    return this.json("POST", "/api/passkey/register/verify", {
      body: { flow: options.body.flow, response },
    });
  }

  async signIn() {
    const options = await this.json<{ flow: string; options: never }>(
      "POST",
      "/api/passkey/login/options",
    );
    if (options.status !== 200) return options;
    const response = await this.passkey.signIn(options.body.options);
    return this.json("POST", "/api/passkey/login/verify", {
      body: { flow: options.body.flow, response },
    });
  }

  /** A keeper gives an invitation; its secret. */
  async invite(role: "reader" | "editor" | "keeper"): Promise<string> {
    const given = await this.json<{ secret: string }>("POST", "/api/members/invitations", {
      body: { role, person: null },
    });
    expect(given.status).toBe(201);
    return given.body.secret;
  }
}

/** One family with an object of its own, so tests do not meet. */
export class Family {
  readonly env: Env;

  constructor(more: Partial<Env> = {}) {
    const name = `family ${crypto.randomUUID()}`;
    const access = env.ACCESS.getByName(name);
    this.env = {
      ...(env as unknown as Env),
      ACCESS: { getByName: () => access } as unknown as Env["ACCESS"],
      ...more,
    };
  }

  browser(): Browser {
    return new Browser(this);
  }

  /** A family set up by Ann, with a member of each role signed in. */
  static async withRoles() {
    const family = new Family();
    const keeper = family.browser();
    expect((await keeper.setUp()).status).toBe(200);
    const browsers = { keeper } as Record<"keeper" | "editor" | "reader", Browser>;
    for (const role of ["editor", "reader"] as const) {
      const one = family.browser();
      expect((await one.join(await keeper.invite(role), role)).status).toBe(200);
      browsers[role] = one;
    }
    return { family, ...browsers };
  }
}
