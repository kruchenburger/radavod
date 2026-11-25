import { writes } from "../../../kernel/change";
import type { MemberId, PersonId } from "../../../kernel/id";
import { type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import type { Credential } from "./credential";
import { type AccessReader, type Change, isLive } from "./member";
import type { Role } from "./rights";

/** A signed-in browser, known by the hash of its token. */
export type Session = { hash: string; member: MemberId; credential: string; expiresAt: number };

const day = 86_400_000;
/** Each use moves the end on: by 30 days after a passkey, by 180 after a bound device. */
const lifetimes: Record<Credential["kind"], number> = { passkey: 30 * day, device: 180 * day };

/** Who a session is. */
export type Signed = { member: MemberId; role: Role; person: PersonId | null; expiresAt: number };

export function signIn(
  reader: AccessReader,
  input: { hash: string; credential: string; now: number },
): Result<Change, Missing> {
  const { hash, now } = input;
  const credential = reader.credential(input.credential);
  if (!isLive(credential) || !isLive(reader.member(credential.member))) {
    return missing(input.credential);
  }
  const session: Session = {
    hash,
    member: credential.member,
    credential: credential.id,
    expiresAt: now + lifetimes[credential.kind],
  };
  return {
    ok: true,
    value: [
      ...writes("credential", credential.id, credential, { ...credential, lastUsedAt: now }),
      ...writes("session", hash, reader.session(hash), session),
    ],
  };
}

/**
 * Who a live session is, with its end moved on. The end is written again at most once a day, so not
 * every request costs a write.
 */
export function slide(
  reader: AccessReader,
  hash: string,
  now: number,
): { signed: Signed; change: Change } | null {
  const session = reader.session(hash);
  if (session === null || now >= session.expiresAt) return null;
  const credential = reader.credential(session.credential);
  const member = reader.member(session.member);
  if (!isLive(credential) || !isLive(member)) return null;
  const end = now + lifetimes[credential.kind];
  const moved = end - session.expiresAt >= day ? { ...session, expiresAt: end } : session;
  const { id, role, person } = member;
  return {
    signed: { member: id, role, person, expiresAt: moved.expiresAt },
    change: writes("session", hash, session, moved),
  };
}

export function signOut(reader: AccessReader, hash: string): Result<Change, Missing> {
  const session = reader.session(hash);
  return session === null
    ? missing("session")
    : { ok: true, value: writes("session", hash, session, null) };
}
