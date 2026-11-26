import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { type Action, can, type Signed } from "../contexts/access";
import type { SessionAnswer } from "../shared/access";
import type { Env } from "./env";
import { hashOf } from "./secrets";
import { FAMILY_ID, stubFor } from "./stub";

/** The Worker as the routes of signing in see it. */
export type Api = { Bindings: Env; Variables: { signed: Signed; token: string } };
export type ApiContext = Context<Api>;

export const SESSION_COOKIE = "__Host-session";

/** Routes anybody may call: they let somebody in, or tell what an invitation is. */
const open = new Set([
  "POST /api/setup/options",
  "POST /api/setup/verify",
  "POST /api/invitation",
  "POST /api/passkey/register/options",
  "POST /api/passkey/register/verify",
  "POST /api/passkey/login/options",
  "POST /api/passkey/login/verify",
  "POST /api/device/bind",
  // Who is signed in: nobody is an answer too, so the app asks it whenever it opens.
  "GET /api/session",
]);

export function accessOf(c: ApiContext) {
  return stubFor(c.env.ACCESS, FAMILY_ID, c.env);
}

/**
 * Ahead of every route of `/api`: a changing request comes from the site itself, and only the routes
 * that let somebody in are open without a session. Anything else without one is 401.
 */
export const gate: MiddlewareHandler<Api> = async (c, next) => {
  const { method } = c.req;
  const isChange = method !== "GET" && method !== "HEAD";
  // The address of the site is set by the installation; without it nothing changes.
  const isOurs = Boolean(c.env.ORIGIN) && c.req.header("origin") === c.env.ORIGIN;
  // The path as the routes read it, so the gate and the routes mean the same route.
  if (open.has(`${method} ${c.req.path}`)) {
    return isChange && !isOurs ? c.json({ error: "origin" }, 403) : next();
  }
  if (tokenOf(c.req.header("cookie")) === null) return c.json({ error: "unauthorized" }, 401);
  if (isChange && !isOurs) return c.json({ error: "origin" }, 403);
  const found = await signedOf(c);
  if (found === null) {
    c.header("set-cookie", clearedCookie());
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("signed", found.signed);
  c.set("token", found.token);
  await next();
};

/** The session of a request, if its cookie still has one. */
export async function signedOf(c: ApiContext): Promise<{ signed: Signed; token: string } | null> {
  const token = tokenOf(c.req.header("cookie"));
  if (token === null) return null;
  const signed = await accessOf(c).session(await hashOf(token), Date.now());
  return signed === null ? null : { signed, token };
}

/** A route for those whose role may do an action, by the table of rights and nothing else. */
export function allow(action: Action): MiddlewareHandler<Api> {
  return async (c, next) => {
    if (!can(c.get("signed").role, action)) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}

export function sessionCookie(token: string, lasts: number): string {
  const seconds = Math.max(0, Math.floor(lasts / 1000));
  return `${SESSION_COOKIE}=${token}; Max-Age=${seconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function tokenOf(cookie: string | undefined): string | null {
  for (const part of (cookie ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(value)) {
      return value;
    }
  }
  return null;
}

/**
 * The address a request came from, by its hash: the address itself goes nowhere. An IPv6 address
 * counts by its /64, which one household holds whole.
 */
export function addressOf(c: ApiContext): Promise<string> {
  const address = c.req.header("cf-connecting-ip") ?? "unknown";
  return hashOf(address.includes(":") ? networkOf(address) : address);
}

/** The first four groups of an IPv6 address, written out. */
function networkOf(address: string): string {
  const [head = "", tail = ""] = address.split("::");
  const front = head === "" ? [] : head.split(":");
  const back = tail === "" ? [] : tail.split(":");
  const groups = address.includes("::")
    ? [...front, ...Array<string>(8 - front.length - back.length).fill("0"), ...back]
    : front;
  return groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/u, ""))
    .join(":");
}

/** Reads a body by its schema; anything else is a bad request. */
export async function bodyOf<T>(c: ApiContext, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  return parsed.success ? parsed.data : null;
}

export const badRequest = (c: ApiContext) => c.json({ error: "bad-request" }, 400);

/** Who is signed in, as the browser is told. */
export async function sessionAnswerOf(c: ApiContext, signed: Signed): Promise<SessionAnswer> {
  const access = accessOf(c);
  const [members, family] = await Promise.all([access.members(), access.family()]);
  const { member, role, person, via } = signed;
  const own = members.find(({ id }) => id === member);
  return {
    member,
    name: own?.name ?? "",
    nickname: own?.nickname ?? null,
    role,
    person,
    family,
    via,
    mayImport: can(role, "exchange"),
  };
}

/** The country Cloudflare says a request came from, if any. */
export function countryOf(c: ApiContext): unknown {
  return (c.req.raw as { cf?: { country?: unknown } }).cf?.country ?? null;
}

const statuses: Record<string, 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429> = {
  forbidden: 403,
  "set-up": 403,
  missing: 404,
  spent: 410,
  expired: 410,
  "last-keeper": 409,
  "stale-version": 409,
  "stale-counter": 401,
  "name-required": 400,
  "nicknames-spent": 409,
  "unknown-aggregate": 400,
  duplicate: 409,
  "passkey-required": 409,
  "one-device": 409,
  "rate-limited": 429,
  "step-over": 410,
  "tree-not-empty": 409,
  "too-large": 413,
};

/** A refusal as an answer: its code, and when a limit lets the next try in. */
export function refused(c: ApiContext, error: { code: string; retryAfter?: number }): Response {
  if (error.retryAfter !== undefined) c.header("retry-after", String(error.retryAfter));
  return c.json({ error: error.code }, statuses[error.code] ?? 400);
}
