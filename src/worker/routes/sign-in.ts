import type { Hono } from "hono";
import { mayLinkBrowser } from "../../contexts/access";
import {
  answerInput,
  bindInput,
  type InvitationAnswer,
  invitationInput,
  registerInput,
  setupInput,
} from "../../shared/access";
import {
  accessOf,
  addressOf,
  type Api,
  type ApiContext,
  badRequest,
  bodyOf,
  refused,
} from "../auth";
import { hashOf, newId, newSecret } from "../secrets";
import { authentication, madePasskey, registration, signedBy, signedIn, taken } from "./passkeys";

/** A setup code shorter than this is no secret: setting up stays closed. */
const shortestCode = 20;

/** Setting a family up, invitations, passkeys and bound devices: the routes open without a session. */
export function signInRoutes(app: Hono<Api>): void {
  // The first keeper, or one more with a new setup code. A wrong code, a used one and none look alike.
  app.post("/api/setup/options", async (c) => {
    const input = await bodyOf(c, setupInput);
    if (input === null) return badRequest(c);
    const limited = await limit(c, "setup");
    if (limited !== null) return limited;
    const code = await hashOf(input.code);
    if (code !== (await setupCodeOf(c)) || !(await accessOf(c).maySetUp(code))) {
      return setupRefused(c);
    }
    const member = { id: newId("member"), name: input.name };
    return registration(c, input.family, member, (hash, challenge) => ({
      hash,
      challenge,
      purpose: "setup",
      code,
      family: input.family,
      member,
    }));
  });

  app.post("/api/setup/verify", async (c) => {
    const input = await bodyOf(c, answerInput);
    if (input === null) return badRequest(c);
    const step = await taken(c, input.flow, "setup");
    if (!step.ok) return refused(c, step.error);
    if (step.value.purpose !== "setup") return badRequest(c);
    const { challenge, code, family, member } = step.value;
    // A code changed while the passkey was made is no longer the code.
    if (code !== (await setupCodeOf(c))) return setupRefused(c);
    const passkey = await madePasskey(c, challenge, input.response, input.label ?? "");
    if (passkey === null) return c.json({ error: "passkey-refused" }, 400);
    const now = Date.now();
    const done = await accessOf(c).setUp({ member, credential: passkey, now, code, family });
    if (!done.ok) return done.error.code === "set-up" ? setupRefused(c) : refused(c, done.error);
    return signedIn(c, passkey.id);
  });

  // What an invitation is: its role and the family, nothing more. Opening it spends nothing.
  app.post("/api/invitation", async (c) => {
    const input = await bodyOf(c, invitationInput);
    if (input === null) return badRequest(c);
    const access = accessOf(c);
    const found = await access.inspect(await hashOf(input.secret), Date.now());
    if (!found.ok) return refused(c, found.error);
    const { kind, role } = found.value;
    const answer: InvitationAnswer = {
      kind,
      role,
      family: await access.family(),
      canLink: mayLinkBrowser(role),
    };
    return c.json(answer);
  });

  app.post("/api/passkey/register/options", async (c) => {
    const input = await bodyOf(c, registerInput);
    if (input === null) return badRequest(c);
    const access = accessOf(c);
    const hash = await hashOf(input.secret);
    const member = await access.newcomer(hash, Date.now(), {
      id: newId("member"),
      name: input.name,
    });
    if (!member.ok) return nobody(c, member.error);
    // A family set up before it had a name is called by its domain.
    return registration(c, null, member.value, (flow, challenge) => ({
      hash: flow,
      challenge,
      purpose: "register",
      invitation: hash,
      member: member.value,
    }));
  });

  app.post("/api/passkey/register/verify", async (c) => {
    const input = await bodyOf(c, answerInput);
    if (input === null) return badRequest(c);
    const step = await taken(c, input.flow, "register");
    if (!step.ok) return refused(c, step.error);
    if (step.value.purpose !== "register") return badRequest(c);
    const { challenge, invitation, member } = step.value;
    const passkey = await madePasskey(c, challenge, input.response, input.label ?? "");
    if (passkey === null) return c.json({ error: "passkey-refused" }, 400);
    const done = await accessOf(c).redeem({
      hash: invitation,
      now: Date.now(),
      member,
      credential: passkey,
    });
    if (!done.ok) return refused(c, done.error);
    return signedIn(c, passkey.id);
  });

  app.post("/api/passkey/login/options", async (c) => {
    const limited = await limit(c, "sign-in");
    if (limited !== null) return limited;
    return authentication(c);
  });

  app.post("/api/passkey/login/verify", async (c) => {
    const input = await bodyOf(c, answerInput);
    if (input === null) return badRequest(c);
    const step = await taken(c, input.flow, "login");
    if (!step.ok) return refused(c, step.error);
    const credential = await accessOf(c).credential(input.response.id);
    const counter =
      credential === null || credential.kind !== "passkey"
        ? null
        : await signedBy(c, step.value.challenge, input.response, credential);
    // Which passkey is unknown, which signature is wrong and which count went back look the same.
    if (credential === null || counter === null) return signInRefused(c);
    const done = await signedIn(c, credential.id, counter);
    return done.status === 401 ? signInRefused(c) : done;
  });

  // A reader whose passkey does not work binds this browser instead, once.
  app.post("/api/device/bind", async (c) => {
    const input = await bodyOf(c, bindInput);
    if (input === null) return badRequest(c);
    const limited = await limit(c, "sign-in");
    if (limited !== null) return limited;
    const access = accessOf(c);
    const hash = await hashOf(input.secret);
    const now = Date.now();
    const member = await access.newcomer(hash, now, { id: newId("member"), name: input.name });
    if (!member.ok) return nobody(c, member.error);
    const device = { id: `device_${newSecret()}`, kind: "device" as const, label: input.label };
    const done = await access.redeem({ hash, now, member: member.value, credential: device });
    if (!done.ok) return refused(c, done.error);
    return signedIn(c, device.id);
  });
}

/** The hash of the setup code of the installation, null when it has none worth the name. */
async function setupCodeOf(c: ApiContext): Promise<string | null> {
  const code = c.env.SETUP_CODE ?? "";
  return code.length < shortestCode ? null : hashOf(code);
}

/** An invitation to join asks for the name of who joins: without it the request is incomplete. */
function nobody(c: ApiContext, error: { code: string; id?: string }): Response {
  return error.code === "missing" && error.id === "member" ? badRequest(c) : refused(c, error);
}

const setupRefused = (c: ApiContext) => c.json({ error: "setup-refused" }, 403);
const signInRefused = (c: ApiContext) => c.json({ error: "sign-in-refused" }, 401);

/** Counts a try from an address; one too many is 429 with when to try again. */
async function limit(c: ApiContext, kind: "sign-in" | "setup"): Promise<Response | null> {
  const tried = await accessOf(c).attempt(kind, await addressOf(c), Date.now());
  return tried.ok ? null : refused(c, tried.error);
}
