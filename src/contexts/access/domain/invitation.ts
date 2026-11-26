import { writes } from "../../../kernel/change";
import type { MemberId, PersonId } from "../../../kernel/id";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import { type CredentialError, credentialFor, type NewCredential } from "./credential";
import {
  type AccessReader,
  allowed,
  type Change,
  type Forbidden,
  isLive,
  type Member,
  type NewMember,
  signedOut,
} from "./member";
import type { Role } from "./rights";

/**
 * A link that lets somebody in once: to join the family, or back into an account whose devices are
 * lost. Its secret is known by its hash only.
 */
export type Invitation = {
  id: string;
  hash: string;
  role: Role;
  person: PersonId | null;
  by: MemberId;
  expiresAt: number;
  spentAt: number | null;
  kind: "join" | "recovery";
  /** Whose account a recovery is for. */
  member: MemberId | null;
};

const day = 86_400_000;
const lifetimes = { join: 14 * day, recovery: day };

export type Spent = { code: "spent" };
export type Expired = { code: "expired" };
export type SetUp = { code: "set-up" };
export type RedeemError = Spent | Expired | Missing | Duplicate | CredentialError;

/**
 * The first keeper, with a passkey. A family with a keeper is closed, but for a new setup code, which
 * brings in one more keeper: so a family that lost every device gets back in.
 */
// The caller checks that the code is the setup code of the installation now; here each code counts once.
export function setUp(
  reader: AccessReader,
  input: {
    member: NewMember;
    credential: NewCredential;
    now: number;
    code: string;
    /** The name of the family, kept when it is set up first. */
    family?: string;
  },
): Result<Change, SetUp | Duplicate | CredentialError> {
  const { member, credential, now, code } = input;
  if (!maySetUp(reader, code)) return { ok: false, error: { code: "set-up" } };
  const made = joined(reader, { ...member, role: "keeper", person: null }, credential, now);
  if (!made.ok) return made;
  const used = writes("setup", code, null, { hash: code, usedAt: now });
  const family = reader.family();
  const named =
    family === null && input.family !== undefined
      ? writes("family", "family" as const, null, { name: input.family })
      : [];
  return { ok: true, value: [...made.value, ...used, ...named] };
}

/** Whether a setup code, by its hash, may still let a keeper in: each does so once. */
export function maySetUp(reader: AccessReader, code: string): boolean {
  return !reader.isCodeUsed(code);
}

/**
 * Who an invitation lets in: somebody new, with the name they give and an identifier made for them,
 * or the member a recovery link is for.
 */
export function newcomerOf(
  reader: AccessReader,
  invitation: Invitation,
  fresh: { id: MemberId; name?: string | undefined },
): NewMember | null {
  if (invitation.kind === "join") {
    return fresh.name === undefined ? null : { id: fresh.id, name: fresh.name };
  }
  const member = invitation.member === null ? null : reader.member(invitation.member);
  return isLive(member) ? { id: member.id, name: member.name } : null;
}

export function invite(
  reader: AccessReader,
  by: MemberId,
  input: { id: string; hash: string; role: Role; person: PersonId | null; now: number },
): Result<Change, Forbidden | Duplicate | Missing> {
  const keeper = allowed(reader, by, "manage-members");
  if (!keeper.ok) return keeper;
  const { id, hash, role, person, now } = input;
  if (person !== null && reader.isErased(person)) return missing(person);
  if (reader.invitation(id) !== null || reader.invitationByHash(hash) !== null) return duplicate;
  const invitation: Invitation = {
    id,
    hash,
    role,
    person,
    by,
    expiresAt: now + lifetimes.join,
    spentAt: null,
    kind: "join",
    member: null,
  };
  return { ok: true, value: writes("invitation", id, null, invitation) };
}

/**
 * A link back into the account of a member whose devices are lost. The old credentials and sessions of
 * that member go at once: whoever holds the lost device is out.
 */
export function recover(
  reader: AccessReader,
  by: MemberId,
  input: { id: string; hash: string; member: MemberId; now: number },
): Result<Change, Forbidden | Missing | Duplicate> {
  const keeper = allowed(reader, by, "manage-members");
  if (!keeper.ok) return keeper;
  const { id, hash, member: whose, now } = input;
  const member = reader.member(whose);
  if (!isLive(member)) return missing(whose);
  if (reader.invitation(id) !== null || reader.invitationByHash(hash) !== null) return duplicate;
  const invitation: Invitation = {
    id,
    hash,
    role: member.role,
    person: member.person,
    by,
    expiresAt: now + lifetimes.recovery,
    spentAt: null,
    kind: "recovery",
    member: whose,
  };
  return {
    ok: true,
    value: [
      ...withoutRecoveries(reader, whose),
      ...writes("invitation", id, null, invitation),
      ...signedOut(reader, whose, now),
    ],
  };
}

export function revokeInvitation(
  reader: AccessReader,
  by: MemberId,
  id: string,
): Result<Change, Forbidden | Missing> {
  const keeper = allowed(reader, by, "manage-members");
  if (!keeper.ok) return keeper;
  const invitation = reader.invitation(id);
  if (invitation === null || invitation.spentAt !== null) return missing(id);
  return { ok: true, value: writes("invitation", id, invitation, null) };
}

/**
 * Spends an invitation on the credential it was opened for: a new member, or a new credential of the
 * account it recovers. An invitation only opened, or whose credential is refused, is not spent.
 */
export function redeem(
  reader: AccessReader,
  input: { hash: string; now: number; member?: NewMember; credential: NewCredential },
): Result<{ change: Change; member: MemberId }, RedeemError> {
  const { hash, now, credential } = input;
  const live = liveInvitation(reader, hash, now);
  if (!live.ok) return live;
  const invitation = live.value;
  const spent = writes("invitation", invitation.id, invitation, { ...invitation, spentAt: now });
  const fresh = input.member ?? { id: "" as MemberId, name: undefined };
  const member = newcomerOf(reader, invitation, fresh);
  if (member === null) return missing(invitation.member ?? "member");
  if (invitation.kind === "recovery") {
    const role = reader.member(member.id)?.role ?? invitation.role;
    const added = credentialFor(reader, { id: member.id, role }, credential, now);
    if (!added.ok) return added;
    const others = withoutRecoveries(reader, member.id).filter(({ id }) => id !== invitation.id);
    const change = [...spent, ...others, ...added.value];
    return { ok: true, value: { change, member: member.id } };
  }
  const { role, person } = invitation;
  const made = joined(reader, { ...member, role, person }, credential, now);
  if (!made.ok) return made;
  return { ok: true, value: { change: [...spent, ...made.value], member: member.id } };
}

/** An invitation that still lets somebody in: not spent, not over, and of a giver who still may. */
export function liveInvitation(
  reader: AccessReader,
  hash: string,
  now: number,
): Result<Invitation, Missing | Spent | Expired> {
  const invitation = reader.invitationByHash(hash);
  if (invitation === null) return missing("invitation");
  if (invitation.spentAt !== null) return { ok: false, error: { code: "spent" } };
  if (now >= invitation.expiresAt) return { ok: false, error: { code: "expired" } };
  // A link is worth what its giver may still do: one lowered or revoked since gives nothing.
  if (!allowed(reader, invitation.by, "manage-members").ok) return missing("invitation");
  return { ok: true, value: invitation };
}

/** Recovery links of a member not yet spent go: only the last one given, or used, counts. */
function withoutRecoveries(reader: AccessReader, member: MemberId): Change {
  return reader.recoveriesOf(member).flatMap((one) => writes("invitation", one.id, one, null));
}

function joined(
  reader: AccessReader,
  member: Pick<Member, "id" | "name" | "role" | "person">,
  credential: NewCredential,
  now: number,
): Result<Change, Duplicate | CredentialError> {
  if (reader.member(member.id) !== null) return duplicate;
  const added = credentialFor(reader, member, credential, now);
  if (!added.ok) return added;
  const after: Member = { ...member, version: 0, createdAt: now, revokedAt: null };
  return { ok: true, value: [...writes("member", member.id, null, after), ...added.value] };
}
