import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type { SessionAnswer } from "../../src/shared/access";
import { type Answer, call } from "./session";

export { type Answer, call, type Refusal, sessionQuery } from "./session";

/** Whether this browser can make and use passkeys at all; a messenger's own browser often cannot. */
export const canUsePasskeys = (): boolean => browserSupportsWebAuthn();

type Flow<O> = { flow: string; options: O };

/**
 * Makes a passkey: asks the server for options, lets the phone or computer make the key, and gives
 * the answer back. The first refusal on the way is the answer.
 */
export async function makePasskey<T>(
  start: string,
  finish: string,
  body: object,
  label: string,
): Promise<Answer<T>> {
  const options = await call<
    Flow<PublicKeyCredentialCreationOptionsJSON> & { proof?: PublicKeyCredentialRequestOptionsJSON }
  >("POST", start, body);
  if (!options.ok) return options;
  const { flow, proof } = options.value;
  try {
    // A passkey of the account signs first, where the server asks for it.
    const signed =
      proof === undefined ? {} : { proof: await startAuthentication({ optionsJSON: proof }) };
    const response = await startRegistration({ optionsJSON: options.value.options });
    return call<T>("POST", finish, { flow, response, label, ...signed });
  } catch (error) {
    return { ok: false, error: { code: refusalOf(error) } };
  }
}

/** Signs in with a passkey the phone or computer offers. */
export async function signInWithPasskey(): Promise<Answer<SessionAnswer>> {
  const options = await call<Flow<PublicKeyCredentialRequestOptionsJSON>>(
    "POST",
    "/api/passkey/login/options",
  );
  if (!options.ok) return options;
  try {
    const response = await startAuthentication({ optionsJSON: options.value.options });
    return call<SessionAnswer>("POST", "/api/passkey/login/verify", {
      flow: options.value.flow,
      response,
    });
  } catch (error) {
    return { ok: false, error: { code: refusalOf(error) } };
  }
}

/** A person closing the dialog is not a failure of the passkey. */
function refusalOf(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "passkey-refused";
}

/** The secret of a link: after the "#", so it never reaches a server log. */
export function secretOfLink(hash: string): string | null {
  const secret = hash.replace(/^#/u, "");
  return /^[A-Za-z0-9_-]{43}$/u.test(secret) ? secret : null;
}

/** The link that carries a secret, for a keeper to send. */
export const linkOf = (secret: string): string => `${window.location.origin}/join#${secret}`;
