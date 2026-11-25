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

export type PasskeyRequired = { code: "passkey-required" };
export type OneDevice = { code: "one-device" };
export type CredentialError = PasskeyRequired | OneDevice | Duplicate;

export const passkeyRequired = { ok: false, error: { code: "passkey-required" } } as const;

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
    if (member.role !== "reader") return passkeyRequired;
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
