import { type Write, writes } from "../../../kernel/change";
import type { MemberId, PersonId } from "../../../kernel/id";
import { type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import type { Credential } from "./credential";
import type { Invitation } from "./invitation";
import { type Action, can, type Role } from "./rights";
import type { Session } from "./session";

/** Somebody of the family who signs in. A member may be tied to a person of the tree. */
export type Member = {
  id: MemberId;
  version: number;
  name: string;
  role: Role;
  person: PersonId | null;
  createdAt: number;
  revokedAt: number | null;
};

export type NewMember = Pick<Member, "id" | "name">;

export type Change = (
  | Write<"member", MemberId, Member>
  | Write<"invitation", string, Invitation>
  | Write<"credential", string, Credential>
  | Write<"session", string, Session>
  | Write<"setup", string, SetupCode>
)[];

/** A setup code that let a keeper in, by its hash. Each code does so once. */
export type SetupCode = { hash: string; usedAt: number };

/** What the access of a family holds. A family has few members: they are read all at once. */
export interface AccessReader {
  member(id: MemberId): Member | null;
  members(): Member[];
  invitation(id: string): Invitation | null;
  invitationByHash(hash: string): Invitation | null;
  /** Every invitation that is kept: a family gives few. */
  invitations(): Invitation[];
  /** The recovery links of a member that are not spent. */
  recoveriesOf(member: MemberId): Invitation[];
  /** Whether a setup code, by its hash, ever let a keeper in. */
  isCodeUsed(hash: string): boolean;
  credential(id: string): Credential | null;
  credentialsOf(member: MemberId): Credential[];
  /** A session by the hash of its token. */
  session(hash: string): Session | null;
  sessionsOf(member: MemberId): Session[];
}

export type Forbidden = { code: "forbidden" };
export type PasskeyRequired = { code: "passkey-required" };
export type LastKeeper = { code: "last-keeper" };

export const forbidden = { ok: false, error: { code: "forbidden" } } as const;
export const lastKeeper = { ok: false, error: { code: "last-keeper" } } as const;
export const passkeyRequired = { ok: false, error: { code: "passkey-required" } } as const;

/** Whether a family has a keeper: until then only setting up is open. */
export function isSetUp(reader: AccessReader): boolean {
  return reader.members().some((one) => isLive(one) && one.role === "keeper");
}

export function isLive<T extends { revokedAt: number | null }>(thing: T | null): thing is T {
  return thing !== null && thing.revokedAt === null;
}

/** Keepers who can sign in: one is always left once a family is set up. */
function keepers(
  members: readonly Member[],
  credentialsOf: (id: MemberId) => Credential[],
): number {
  return members
    .filter((one) => isLive(one) && one.role === "keeper")
    .filter((one) => credentialsOf(one.id).some((credential) => isLive(credential))).length;
}

/**
 * Whether a family still has a keeper who can sign in after a change, if it had one before. Every
 * change goes through it, so no order of operations leaves the family without one.
 */
export function keepsAKeeper(reader: AccessReader, change: Change): boolean {
  const before = reader.members();
  if (keepers(before, (id) => reader.credentialsOf(id)) === 0) return true;
  const after = <T>(kind: Change[number]["kind"], stored: T[], keyOf: (one: T) => string) => {
    const known = new Map(stored.map((one) => [keyOf(one), one]));
    for (const write of change) {
      if (write.kind !== kind) continue;
      if (write.after === null) known.delete(write.id);
      else known.set(write.id, write.after as T);
    }
    return [...known.values()];
  };
  const members = after("member", before, ({ id }) => id);
  const credentials = after(
    "credential",
    members.flatMap(({ id }) => reader.credentialsOf(id)),
    ({ id }) => id,
  );
  return keepers(members, (id) => credentials.filter((one) => one.member === id)) > 0;
}

/** A live member allowed an action, or the refusal. */
export function allowed(
  reader: AccessReader,
  by: MemberId,
  action: Action,
): Result<Member, Forbidden> {
  const member = reader.member(by);
  return isLive(member) && can(member.role, action) ? { ok: true, value: member } : forbidden;
}

/** The credentials of a member revoked, and the sessions on them ended. */
export function signedOut(reader: AccessReader, id: MemberId, now: number): Change {
  return [
    ...reader
      .credentialsOf(id)
      .filter((one) => isLive(one))
      .flatMap((one) => writes("credential", one.id, one, { ...one, revokedAt: now })),
    ...reader.sessionsOf(id).flatMap((one) => writes("session", one.hash, one, null)),
  ];
}

export function changeRole(
  reader: AccessReader,
  by: MemberId,
  id: MemberId,
  role: Role,
  now: number,
): Result<Change, Forbidden | Missing | PasskeyRequired> {
  const keeper = allowed(reader, by, "manage-members");
  if (!keeper.ok) return keeper;
  const member = reader.member(id);
  if (!isLive(member)) return missing(id);
  const credentials = reader.credentialsOf(id).filter((one) => isLive(one));
  // An editor and a keeper sign in by passkey: a device of a reader goes when the reader is raised.
  const devices = role === "reader" ? [] : credentials.filter(({ kind }) => kind === "device");
  if (devices.length > 0 && devices.length === credentials.length) return passkeyRequired;
  const gone = new Set(devices.map(({ id: one }) => one));
  return {
    ok: true,
    value: [
      ...writes("member", id, member, { ...member, role }),
      ...devices.flatMap((one) => writes("credential", one.id, one, { ...one, revokedAt: now })),
      ...reader
        .sessionsOf(id)
        .filter(({ credential }) => gone.has(credential))
        .flatMap((one) => writes("session", one.hash, one, null)),
    ],
  };
}

/** Takes a member's sign-in away. The member stays, so the journal still knows who wrote. */
export function revokeMember(
  reader: AccessReader,
  by: MemberId,
  id: MemberId,
  now: number,
): Result<Change, Forbidden | Missing> {
  const keeper = allowed(reader, by, "manage-members");
  if (!keeper.ok) return keeper;
  const member = reader.member(id);
  if (!isLive(member)) return missing(id);
  return {
    ok: true,
    value: [
      ...writes("member", id, member, { ...member, revokedAt: now }),
      ...signedOut(reader, id, now),
    ],
  };
}

/** A member deletes their own account: the journal calls them a former member. */
export function deleteAccount(reader: AccessReader, id: MemberId): Result<Change, Forbidden> {
  const member = allowed(reader, id, "own-account");
  if (!member.ok) return member;
  return {
    ok: true,
    value: [
      ...reader.sessionsOf(id).flatMap((one) => writes("session", one.hash, one, null)),
      ...reader.credentialsOf(id).flatMap((one) => writes("credential", one.id, one, null)),
      ...writes("member", id, member.value, null),
    ],
  };
}

/** Members and invitations tied to people erased from the tree are tied to nobody now. */
export function withoutPeople(reader: AccessReader, people: readonly PersonId[]): Change {
  const gone = new Set<string>(people);
  return [
    ...reader
      .members()
      .filter(({ person }) => person !== null && gone.has(person))
      .flatMap((one) => writes("member", one.id, one, { ...one, person: null })),
    ...reader
      .invitations()
      .filter(({ person }) => person !== null && gone.has(person))
      .flatMap((one) => writes("invitation", one.id, one, { ...one, person: null })),
  ];
}
