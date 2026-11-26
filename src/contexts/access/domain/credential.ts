import { writes } from "../../../kernel/change";
import type { MemberId } from "../../../kernel/id";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import {
  type AccessReader,
  allowed,
  type Change,
  type Forbidden,
  isLive,
  type Member,
  type PasskeyRequired,
  passkeyRequired,
} from "./member";

/** A way to sign in: a passkey, or a device a reader bound when a passkey did not work. */
export type Credential = {
  id: string;
  member: MemberId;
  kind: "passkey" | "device";
  /** Of a passkey. */
  publicKey?: string;
  counter?: number;
  createdAt: number;
  lastUsedAt: number;
  revokedAt: number | null;
  /** What the member calls it: "phone", "laptop". */
  label: string;
};

export type NewCredential = Pick<Credential, "id" | "kind" | "label" | "publicKey" | "counter">;

export type OneDevice = { code: "one-device" };
export type CredentialError = PasskeyRequired | OneDevice | Duplicate;

/** Only a reader may sign in with a linked browser; an editor and a keeper sign in by passkey. */
export function mayLinkBrowser(role: Member["role"]): boolean {
  return role === "reader";
}

/** The passkeys of an account that may prove it, to add one more; none, and a passkey cannot be added. */
export function provers(reader: AccessReader, id: MemberId): Result<string[], PasskeyRequired> {
  const passkeys = reader
    .credentialsOf(id)
    .filter((one) => isLive(one) && one.kind === "passkey")
    .map((one) => one.id);
  return passkeys.length === 0 ? passkeyRequired : { ok: true, value: passkeys };
}

/**
 * A credential a member may have: an editor and a keeper sign in by passkey, a reader may also bind one
 * device.
 */
export function credentialFor(
  reader: AccessReader,
  member: Pick<Member, "id" | "role">,
  credential: NewCredential,
  now: number,
): Result<Change, CredentialError> {
  if (reader.credential(credential.id) !== null) return duplicate;
  if (credential.kind === "device") {
    if (!mayLinkBrowser(member.role)) return passkeyRequired;
    const devices = reader
      .credentialsOf(member.id)
      .filter((one) => isLive(one) && one.kind === "device");
    if (devices.length > 0) return { ok: false, error: { code: "one-device" } };
  }
  const after: Credential = {
    ...credential,
    member: member.id,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
  };
  return { ok: true, value: writes("credential", credential.id, null, after) };
}

/** A member adds a passkey, or a reader a device. */
export function addCredential(
  reader: AccessReader,
  id: MemberId,
  credential: NewCredential,
  now: number,
): Result<Change, CredentialError | Forbidden> {
  const member = allowed(reader, id, "own-account");
  return member.ok ? credentialFor(reader, member.value, credential, now) : member;
}

/** A member revokes a credential of their own, a keeper anybody's. Its sessions end. */
export function revokeCredential(
  reader: AccessReader,
  by: MemberId,
  id: string,
  now: number,
): Result<Change, Forbidden | Missing> {
  const credential = reader.credential(id);
  if (!isLive(credential)) return missing(id);
  const own = credential.member === by;
  const actor = allowed(reader, by, own ? "own-account" : "manage-members");
  if (!actor.ok) return actor;
  return {
    ok: true,
    value: [
      ...writes("credential", id, credential, { ...credential, revokedAt: now }),
      ...reader
        .sessionsOf(credential.member)
        .filter((one) => one.credential === id)
        .flatMap((one) => writes("session", one.hash, one, null)),
    ],
  };
}

/** A passkey that counts its uses never counts back: a lower count is a copy of it, or a replay. */
export function countsOn(credential: Credential, counter: number): boolean {
  const stored = credential.counter ?? 0;
  return stored === 0 || counter > stored;
}

export type StaleCounter = { code: "stale-counter" };

/**
 * One more passkey for one's own account, proven by a passkey of the same account just now: a session
 * alone, or a linked browser, does not make a passkey that outlives it.
 */
export function addPasskey(
  reader: AccessReader,
  id: MemberId,
  credential: NewCredential,
  now: number,
  proof: { credential: string; counter: number },
): Result<Change, CredentialError | Forbidden | PasskeyRequired | StaleCounter> {
  const allowed = provers(reader, id);
  if (!allowed.ok) return allowed;
  const by = reader.credential(proof.credential);
  if (by === null || !allowed.value.includes(by.id) || credential.kind !== "passkey") {
    return passkeyRequired;
  }
  if (!countsOn(by, proof.counter)) return { ok: false, error: { code: "stale-counter" } };
  const added = addCredential(reader, id, credential, now);
  if (!added.ok) return added;
  const used = { ...by, lastUsedAt: now, counter: proof.counter };
  return { ok: true, value: [...writes("credential", by.id, by, used), ...added.value] };
}
