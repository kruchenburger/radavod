import type { MemberId, PersonId } from "../../../kernel/id";
import type { Duplicate, Missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import {
  addCredential,
  type Credential,
  type CredentialError,
  type NewCredential,
  revokeCredential,
} from "../domain/credential";
import {
  invite,
  recover,
  redeem,
  type RedeemError,
  revokeInvitation,
  type SetUp,
  setUp,
} from "../domain/invitation";
import {
  type Change,
  changeRole,
  deleteAccount,
  type Forbidden,
  isLive,
  keepsAKeeper,
  type LastKeeper,
  lastKeeper,
  type Member,
  type NewMember,
  revokeMember,
} from "../domain/member";
import type { Role } from "../domain/rights";
import { type Signed, signIn, signOut, slide } from "../domain/session";
import type { AccessStore } from "./ports";

export type AccessError =
  Forbidden | LastKeeper | SetUp | Missing | Duplicate | CredentialError | RedeemError;

/**
 * Members, invitations, credentials and sessions of a family. A command that is refused or changes
 * nothing is not stored, and none leaves a set-up family without a keeper who can sign in.
 */
export interface Access {
  isSetUp(): boolean;
  member(id: MemberId): Member | null;
  members(): Member[];
  credentialsOf(id: MemberId): Credential[];
  setUp(input: {
    member: NewMember;
    credential: NewCredential;
    now: number;
    /** A new setup code lets in one more keeper. */
    again?: boolean;
  }): Result<Change, AccessError>;
  invite(
    by: MemberId,
    input: { id: string; hash: string; role: Role; person: PersonId | null; now: number },
  ): Result<Change, AccessError>;
  recover(
    by: MemberId,
    input: { id: string; hash: string; member: MemberId; now: number },
  ): Result<Change, AccessError>;
  revokeInvitation(by: MemberId, id: string): Result<Change, AccessError>;
  /** Spends an invitation: a new member, or a credential of the account it recovers. */
  redeem(input: {
    hash: string;
    now: number;
    member?: NewMember;
    credential: NewCredential;
  }): Result<MemberId, AccessError>;
  addCredential(id: MemberId, credential: NewCredential, now: number): Result<Change, AccessError>;
  revokeCredential(by: MemberId, id: string, now: number): Result<Change, AccessError>;
  changeRole(by: MemberId, id: MemberId, role: Role, now: number): Result<Change, AccessError>;
  revoke(by: MemberId, id: MemberId, now: number): Result<Change, AccessError>;
  deleteAccount(id: MemberId): Result<Change, AccessError>;
  signIn(input: { hash: string; credential: string; now: number }): Result<Change, AccessError>;
  /** Who a session is, its end moved on; null for one that is over. */
  session(hash: string, now: number): Signed | null;
  signOut(hash: string): Result<Change, AccessError>;
}

export function accessOver(store: AccessStore): Access {
  const saved = <E extends { code: string }>(
    result: Result<Change, E>,
  ): Result<Change, E | LastKeeper> => {
    if (!result.ok || result.value.length === 0) return result;
    if (!keepsAKeeper(store, result.value)) return lastKeeper;
    store.save(result.value);
    return result;
  };
  return {
    isSetUp: () => store.members().some((one) => isLive(one) && one.role === "keeper"),
    member: (id) => store.member(id),
    members: () => store.members(),
    credentialsOf: (id) => store.credentialsOf(id),
    setUp: (input) => saved(setUp(store, input)),
    invite: (by, input) => saved(invite(store, by, input)),
    recover: (by, input) => saved(recover(store, by, input)),
    revokeInvitation: (by, id) => saved(revokeInvitation(store, by, id)),
    redeem(input) {
      const redeemed = redeem(store, input);
      if (!redeemed.ok) return redeemed;
      const done = saved<AccessError>({ ok: true, value: redeemed.value.change });
      return done.ok ? { ok: true, value: redeemed.value.member } : done;
    },
    addCredential: (id, credential, now) => saved(addCredential(store, id, credential, now)),
    revokeCredential: (by, id, now) => saved(revokeCredential(store, by, id, now)),
    changeRole: (by, id, role, now) => saved(changeRole(store, by, id, role, now)),
    revoke: (by, id, now) => saved(revokeMember(store, by, id, now)),
    deleteAccount: (id) => saved(deleteAccount(store, id)),
    signIn: (input) => saved(signIn(store, input)),
    session(hash, now) {
      const live = slide(store, hash, now);
      if (live === null) return null;
      if (live.change.length > 0) store.save(live.change);
      return live.signed;
    },
    signOut: (hash) => saved(signOut(store, hash)),
  };
}
