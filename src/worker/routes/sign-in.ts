import type { Hono } from "hono";
import {
  answerInput,
  bindInput,
  type InvitationAnswer,
  invitationInput,
  registerInput,
  setupInput,
} from "../../shared/access";
import { accessOf, addressOf, type Api, type ApiContext, refused } from "../auth";
import { hashOf, newId, newSecret } from "../secrets";
import {
  authentication,
  badRequest,
  bodyOf,
  madePasskey,
  registration,
  signedBy,
  signedIn,
  taken,
} from "./passkeys";

/** Setting a family up, invitations, passkeys and bound devices: the routes open without a session. */
export function signInRoutes(app: Hono<Api>): void {
  // The first keeper, or one more with a new setup code. A wrong code and a used one look the same.
  app.post("/api/setup/options", async (c) => {
    const input = await bodyOf(c, setupInput);
    if (input === null) return badRequest(c);
    const setupCode = c.env.SETUP_CODE;
    if (!setupCode) return c.json({ error: "not-found" }, 404);
    const limited = await limit(c, "setup");
    if (limited !== null) return limited;
    const [code, expected] = await Promise.all([hashOf(input.code), hashOf(setupCode)]);
    if (code !== expected || (await accessOf(c).isCodeUsed(code))) {
      return c.json({ error: "setup-refused" }, 403);
    }
    const member = { id: newId("member"), name: input.name };
    return registration(c, member, (hash, challenge) => ({
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
    const passkey = await madePasskey(c, challenge, input.response, input.label ?? "");
    if (passkey === null) return c.json({ error: "passkey-refused" }, 400);
    const now = Date.now();
    const done = await accessOf(c).setUp({ member, credential: passkey, now, code, family });
    if (!done.ok) return refused(c, done.error);
    return signedIn(c, passkey.id, "passkey");
  });

  // What an invitation is: its role and the family, nothing more. Opening it spends nothing.
  app.post("/api/invitation", async (c) => {
    const input = await bodyOf(c, invitationInput);
    if (input === null) return badRequest(c);
    const access = accessOf(c);
    const found = await access.inspect(await hashOf(input.secret), Date.now());
    if (!found.ok) return refused(c, found.error);
    const { kind, role } = found.value;
    const answer: InvitationAnswer = { kind, role, family: await access.family() };
    return c.json(answer);
  });

  app.post("/api/passkey/register/options", async (c) => {
    const input = await bodyOf(c, registerInput);
    if (input === null) return badRequest(c);
    const access = accessOf(c);
    const hash = await hashOf(input.secret);
    const found = await access.inspect(hash, Date.now());
    if (!found.ok) return refused(c, found.error);
    const member = await newcomer(c, found.value, input.name);
    if (member === null) return badRequest(c);
    return registration(c, member, (flow, challenge) => ({
      hash: flow,
      challenge,
      purpose: "register",
      invitation: hash,
      member,
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
    return signedIn(c, passkey.id, "passkey");
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
    // Which passkey is unknown and which signature is wrong look the same.
    if (credential === null || counter === null) return c.json({ error: "sign-in-refused" }, 401);
    return signedIn(c, credential.id, "passkey", counter);
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
    const found = await access.inspect(hash, now);
    if (!found.ok) return refused(c, found.error);
    const member = await newcomer(c, found.value, input.name);
    if (member === null) return badRequest(c);
    const device = { id: `device_${newSecret()}`, kind: "device" as const, label: input.label };
    const done = await access.redeem({ hash, now, member, credential: device });
    if (!done.ok) return refused(c, done.error);
    return signedIn(c, device.id, "device");
  });
}

/** Who an invitation lets in: somebody new with the name they give, or the member it recovers. */
async function newcomer(
  c: ApiContext,
  invitation: { kind: "join" | "recovery"; member: string | null },
  name: string | undefined,
) {
  if (invitation.kind === "join") return name === undefined ? null : { id: newId("member"), name };
  const members = await accessOf(c).members();
  const member = members.find(({ id }) => id === invitation.member);
  return member === undefined ? null : { id: member.id, name: member.name };
}

/** Counts a try from an address; one too many is 429 with when to try again. */
async function limit(c: ApiContext, kind: "sign-in" | "setup"): Promise<Response | null> {
  const tried = await accessOf(c).attempt(kind, await addressOf(c), Date.now());
  return tried.ok ? null : refused(c, tried.error);
}
