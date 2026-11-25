import { isId, type MemberId, type PersonId } from "../../../kernel/id";
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
  allowed,
  type Change,
  changeRole,
  deleteAccount,
  type Forbidden,
  isSetUp,
  keepsAKeeper,
  type LastKeeper,
  lastKeeper,
  type Member,
  type NewMember,
  revokeMember,
  withoutPeople,
} from "../domain/member";
import type { Role } from "../domain/rights";
import { type Signed, signIn, signOut, slide } from "../domain/session";
import {
  allowance,
  type Limit,
  longestWindow,
  type RateLimited,
  windowStart,
} from "../domain/limits";
import { countryOf, type LogEntry } from "../domain/log";
import type { AccessStore } from "./ports";

/** What a member saw: "member/<id>" and its version, 0 for one not there. */
export type Expected = Record<string, number>;

export type StaleVersion = { code: "stale-version"; aggregate: string; current: number };

export type AccessError =
  | RateLimited
  | Forbidden
  | LastKeeper
  | SetUp
  | Missing
  | Duplicate
  | CredentialError
  | RedeemError;

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
    /** The hash of the setup code: a new one lets in one more keeper, each only once. */
    code: string;
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
  /** A sign-in, written in the log with the country it came from, if any. */
  signIn(input: {
    hash: string;
    credential: string;
    now: number;
    country?: unknown;
  }): Result<Change, AccessError>;
  /** Who a session is, its end moved on; null for one that is over. */
  session(hash: string, now: number): Signed | null;
  signOut(hash: string): Result<Change, AccessError>;
  /**
   * Counts a try of a key, an address by its hash; one too many is refused with when to try again.
   * Invitations and recovery links count themselves.
   */
  attempt(limit: Exclude<Limit, "invite">, key: string, now: number): Result<null, RateLimited>;
  /** The sign-in log, for a keeper. */
  log(by: MemberId): Result<LogEntry[], AccessError>;
  /** People erased from the tree are tied to no member and no invitation. */
  forget(people: readonly PersonId[]): void;
  /** The first version a member saw that is not the one kept, or null. */
  stale(expected: Expected): StaleVersion | null;
  /** Takes away what is over. */
  clean(now: number): void;
  /** Whether anything is kept that will be over some day. */
  isWaiting(): boolean;
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
    isSetUp: () => isSetUp(store),
    member: (id) => store.member(id),
    members: () => store.members(),
    credentialsOf: (id) => store.credentialsOf(id),
    setUp: (input) => saved(setUp(store, input)),
    invite(by, input) {
      const tries = store.triesOf("invite", by, windowStart("invite", input.now));
      const room = allowance("invite", tries, input.now);
      if (!room.ok) return room;
      const done = saved(invite(store, by, input));
      if (done.ok) store.tried("invite", by, input.now);
      return done;
    },
    recover(by, input) {
      const tries = store.triesOf("invite", by, windowStart("invite", input.now));
      const room = allowance("invite", tries, input.now);
      if (!room.ok) return room;
      const done = saved(recover(store, by, input));
      if (done.ok) {
        store.tried("invite", by, input.now);
        const { member, now: at } = input;
        store.log({ at, kind: "recovery", member, credential: null, by, country: null });
      }
      return done;
    },
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
    signIn(input) {
      const done = saved(signIn(store, input));
      const member = store.credential(input.credential)?.member;
      if (done.ok && member !== undefined) {
        const { now: at, credential, country } = input;
        store.log({
          at,
          kind: "sign-in",
          member,
          credential,
          by: null,
          country: countryOf(country),
        });
      }
      return done;
    },
    session(hash, now) {
      const live = slide(store, hash, now);
      if (live === null) return null;
      if (live.change.length > 0) store.save(live.change);
      return live.signed;
    },
    signOut: (hash) => saved(signOut(store, hash)),
    attempt(limit, key, now) {
      const room = allowance(limit, store.triesOf(limit, key, windowStart(limit, now)), now);
      if (room.ok) store.tried(limit, key, now);
      return room;
    },
    log(by) {
      const keeper = allowed(store, by, "manage-members");
      return keeper.ok ? { ok: true, value: store.logged() } : keeper;
    },
    forget(people) {
      const change = withoutPeople(store, people);
      if (change.length > 0) store.save(change);
    },
    stale(expected) {
      for (const [aggregate, seen] of Object.entries(expected)) {
        const [kind, id, more] = aggregate.split("/");
        // The key came from the code, not from a member.
        if (kind !== "member" || more !== undefined || !isId("member", id)) {
          throw new Error("unknown-aggregate");
        }
        const current = store.member(id)?.version ?? 0;
        if (current !== seen) return { code: "stale-version", aggregate, current };
      }
      return null;
    },
    clean: (now) => store.clean(now, now - longestWindow),
    isWaiting: () => store.isWaiting(),
  };
}
