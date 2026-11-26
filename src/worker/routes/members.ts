import type { Hono } from "hono";
import type { MemberId } from "../../kernel/id";
import {
  addInput,
  inviteInput,
  type LinkAnswer,
  roleInput,
  versionInput,
} from "../../shared/access";
import {
  accessOf,
  allow,
  type Api,
  type ApiContext,
  badRequest,
  bodyOf,
  clearedCookie,
  refused,
  sessionAnswerOf,
  sessionCookie,
  signedOf,
} from "../auth";
import { can } from "../../contexts/access";
import { hashOf, newSecret } from "../secrets";
import { madePasskey, registration, signedBy, taken } from "./passkeys";

/** Who is signed in, the members of the family, and one's own account. Each needs a session. */
export function memberRoutes(app: Hono<Api>): void {
  // Each time the app opens, the cookie is given again for as long as the session now lasts.
  app.get("/api/session", async (c) => {
    const found = await signedOf(c);
    if (found === null) {
      // A cookie of a session that is over goes too.
      if (c.req.header("cookie")?.includes("__Host-session="))
        c.header("set-cookie", clearedCookie());
      return c.json(null);
    }
    const { signed, token } = found;
    if (!can(signed.role, "own-account")) return c.json({ error: "forbidden" }, 403);
    c.header("set-cookie", sessionCookie(token, signed.expiresAt - Date.now()));
    return c.json(await sessionAnswerOf(c, signed));
  });

  app.post("/api/logout", allow("own-account"), async (c) => {
    await accessOf(c).signOut(await hashOf(c.get("token")));
    c.header("set-cookie", clearedCookie());
    return c.body(null, 204);
  });

  // Everybody sees the names; a keeper sees credentials and invitations too.
  app.get("/api/members", allow("see-members"), async (c) => {
    const roster = await accessOf(c).roster(c.get("signed").member);
    return roster.ok ? c.json(roster.value) : refused(c, roster.error);
  });

  app.post("/api/members/invitations", allow("manage-members"), async (c) => {
    const input = await bodyOf(c, inviteInput);
    if (input === null) return badRequest(c);
    return linkOf(c, (id, hash, now) =>
      accessOf(c).invite(c.get("signed").member, { id, hash, ...input, now }),
    );
  });

  app.delete("/api/members/invitations/:id", allow("manage-members"), async (c) => {
    const done = await accessOf(c).revokeInvitation(c.get("signed").member, c.req.param("id"));
    return done.ok ? c.body(null, 204) : refused(c, done.error);
  });

  app.post("/api/members/:id/role", allow("manage-members"), async (c) => {
    const input = await bodyOf(c, roleInput);
    if (input === null) return badRequest(c);
    const id = c.req.param("id") as MemberId;
    const done = await accessOf(c).changeRole(c.get("signed").member, id, input.role, Date.now(), {
      [`member/${id}`]: input.version,
    });
    return done.ok ? c.body(null, 204) : refused(c, done.error);
  });

  app.post("/api/members/:id/revoke", allow("manage-members"), async (c) => {
    const input = await bodyOf(c, versionInput);
    if (input === null) return badRequest(c);
    const id = c.req.param("id") as MemberId;
    const done = await accessOf(c).revoke(c.get("signed").member, id, Date.now(), {
      [`member/${id}`]: input.version,
    });
    return done.ok ? c.body(null, 204) : refused(c, done.error);
  });

  // A link back into an account whose devices are lost; its old sign-ins end at once.
  app.post("/api/members/:id/recovery", allow("manage-members"), async (c) => {
    const member = c.req.param("id") as MemberId;
    return linkOf(c, (id, hash, now) =>
      accessOf(c).recover(c.get("signed").member, { id, hash, member, now }),
    );
  });

  app.get("/api/members/log", allow("manage-members"), async (c) => {
    const log = await accessOf(c).log(c.get("signed").member);
    return log.ok ? c.json({ log: log.value }) : refused(c, log.error);
  });

  // One's own credential, or anybody's for a keeper: the rule says which.
  app.post("/api/credentials/:id/revoke", allow("own-account"), async (c) => {
    const done = await accessOf(c).revokeCredential(
      c.get("signed").member,
      c.req.param("id"),
      Date.now(),
    );
    return done.ok ? c.body(null, 204) : refused(c, done.error);
  });

  // What a member may take away of their own account: who they are and what they sign in with.
  app.get("/api/account", allow("own-account"), async (c) => {
    const account = await accessOf(c).account(c.get("signed").member);
    return account.ok ? c.json(account.value) : refused(c, account.error);
  });

  // One more passkey for one's own account, made the way the first one was.
  // A passkey of the account signs first: a linked browser or a stolen session makes no passkey.
  app.post("/api/passkey/add/options", allow("own-account"), async (c) => {
    const access = accessOf(c);
    const { member: id } = c.get("signed");
    const account = await access.account(id);
    if (!account.ok) return refused(c, account.error);
    const passkeys = account.value.credentials
      .filter(({ kind, revokedAt }) => kind === "passkey" && revokedAt === null)
      .map((one) => one.id);
    if (passkeys.length === 0) return refused(c, { code: "passkey-required" });
    const member = { id, name: account.value.member.name };
    const family = (await access.family()) ?? c.env.RP_ID ?? "";
    return registration(
      c,
      family,
      member,
      (hash, challenge) => ({ hash, challenge, purpose: "add", member }),
      passkeys,
    );
  });

  app.post("/api/passkey/add/verify", allow("own-account"), async (c) => {
    const input = await bodyOf(c, addInput);
    if (input === null) return badRequest(c);
    const step = await taken(c, input.flow, "add");
    if (!step.ok) return refused(c, step.error);
    // A step begun by another member is not this member's to finish.
    if (step.value.purpose !== "add" || step.value.member.id !== c.get("signed").member) {
      return badRequest(c);
    }
    const access = accessOf(c);
    const by = await access.credential(input.proof.id);
    const counter = by === null ? null : await signedBy(c, step.value.challenge, input.proof, by);
    if (by === null || counter === null) return c.json({ error: "sign-in-refused" }, 401);
    const passkey = await madePasskey(c, step.value.challenge, input.response, input.label ?? "");
    if (passkey === null) return c.json({ error: "passkey-refused" }, 400);
    const proof = { credential: by.id, counter };
    const done = await access.addPasskey(step.value.member.id, passkey, Date.now(), proof);
    return done.ok ? c.body(null, 201) : refused(c, done.error);
  });

  app.delete("/api/account", allow("own-account"), async (c) => {
    const done = await accessOf(c).deleteAccount(c.get("signed").member);
    if (!done.ok) return refused(c, done.error);
    c.header("set-cookie", clearedCookie());
    return c.body(null, 204);
  });
}

/** Gives a link: an id and a secret made here, kept by its hash, shown to the keeper once. */
async function linkOf(
  c: ApiContext,
  give: (
    id: string,
    hash: string,
    now: number,
  ) => Promise<{ ok: true; value: { expiresAt: number } } | { ok: false; error: { code: string } }>,
): Promise<Response> {
  const [id, secret] = [newSecret(), newSecret()];
  const done = await give(id, await hashOf(secret), Date.now());
  if (!done.ok) return refused(c, done.error);
  const answer: LinkAnswer = { id, secret, expiresAt: done.value.expiresAt };
  return c.json(answer, 201);
}
