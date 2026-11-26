import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { z } from "zod";
import type { Credential, Purpose } from "../../contexts/access";
import type { MemberId } from "../../kernel/id";
import type { passkeyAnswerSchema } from "../../shared/access";
import {
  accessOf,
  type ApiContext,
  countryOf,
  refused,
  sessionAnswerOf,
  sessionCookie,
} from "../auth";
import { base64url, fromBase64url, hashOf, newSecret } from "../secrets";

/** What WebAuthn needs of the installation: its domain and its address. */
function siteOf(c: ApiContext): { rpID: string; origin: string } | null {
  const { RP_ID, ORIGIN } = c.env;
  return RP_ID && ORIGIN ? { rpID: RP_ID, origin: ORIGIN } : null;
}

export const notConfigured = (c: ApiContext) => c.json({ error: "not-configured" }, 503);

/** Begins making a passkey for a member: the options for the browser and the token of the step. */
export async function registration(
  c: ApiContext,
  /** What the passkey dialog of a phone calls the site: the family. */
  family: string,
  member: { id: MemberId; name: string },
  step: (
    hash: string,
    challenge: string,
  ) => Parameters<ReturnType<typeof accessOf>["openChallenge"]>[0],
) {
  const site = siteOf(c);
  if (site === null) return notConfigured(c);
  const options = await generateRegistrationOptions({
    rpName: family,
    rpID: site.rpID,
    userName: member.name,
    userDisplayName: member.name,
    userID: Uint8Array.from(new TextEncoder().encode(member.id)),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const flow = newSecret();
  const opened = await accessOf(c).openChallenge(
    step(await hashOf(flow), options.challenge),
    Date.now(),
  );
  if (!opened.ok) return refused(c, opened.error);
  return c.json({ flow, options });
}

/** The passkey a browser made, if it answered the challenge of its step. */
export async function madePasskey(
  c: ApiContext,
  challenge: string,
  response: z.infer<typeof passkeyAnswerSchema>,
  label: string,
): Promise<{
  id: string;
  kind: "passkey";
  label: string;
  publicKey: string;
  counter: number;
} | null> {
  const site = siteOf(c);
  if (site === null) return null;
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: site.origin,
      expectedRPID: site.rpID,
      requireUserVerification: true,
    });
    if (!verified) return null;
    const { id, publicKey, counter } = registrationInfo.credential;
    return { id, kind: "passkey", label, publicKey: base64url(publicKey), counter };
  } catch {
    // What is wrong with an answer is the browser's business; the log gets a code only.
    console.error("passkey: registration refused");
    return null;
  }
}

/** Begins signing in with a passkey the browser chooses. */
export async function authentication(c: ApiContext) {
  const site = siteOf(c);
  if (site === null) return notConfigured(c);
  const options = await generateAuthenticationOptions({
    rpID: site.rpID,
    userVerification: "required",
  });
  const flow = newSecret();
  const hash = await hashOf(flow);
  const opened = await accessOf(c).openChallenge(
    { hash, purpose: "login", challenge: options.challenge },
    Date.now(),
  );
  if (!opened.ok) return refused(c, opened.error);
  return c.json({ flow, options });
}

/** The new counter of a passkey that signed the challenge, or null. */
export async function signedBy(
  c: ApiContext,
  challenge: string,
  response: z.infer<typeof passkeyAnswerSchema>,
  credential: Credential,
): Promise<number | null> {
  const site = siteOf(c);
  if (site === null || credential.publicKey === undefined) return null;
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: response as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: site.origin,
      expectedRPID: site.rpID,
      credential: {
        id: credential.id,
        publicKey: fromBase64url(credential.publicKey),
        counter: credential.counter ?? 0,
      },
      requireUserVerification: true,
    });
    return verified ? authenticationInfo.newCounter : null;
  } catch {
    console.error("passkey: sign-in refused");
    return null;
  }
}

/** Takes the challenge of a step: answered once, whatever the answer. */
export async function taken<P extends Purpose>(c: ApiContext, flow: string, purpose: P) {
  return accessOf(c).takeChallenge(await hashOf(flow), purpose, Date.now());
}

/** Signs a credential in: a session, its cookie, and who it is. */
export async function signedIn(
  c: ApiContext,
  credential: string,
  counter?: number,
): Promise<Response> {
  const token = newSecret();
  const now = Date.now();
  const access = accessOf(c);
  const started = await access.signIn({
    hash: await hashOf(token),
    credential,
    now,
    country: countryOf(c),
    ...(counter === undefined ? {} : { counter }),
  });
  if (!started.ok) return refused(c, started.error);
  const signed = await access.session(await hashOf(token), now);
  if (signed === null) return c.json({ error: "unauthorized" }, 401);
  // The cookie lasts as long as the session the rules gave.
  c.header("set-cookie", sessionCookie(token, signed.expiresAt - now));
  return c.json(await sessionAnswerOf(c, signed));
}
