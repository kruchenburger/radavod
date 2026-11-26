import { isId, type MemberId, type PersonId } from "../../../kernel/id";
import { type Duplicate, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import {
  addCredential,
  type Credential,
  type CredentialError,
  type NewCredential,
  revokeCredential,
} from "../domain/credential";
import {
  type Challenge,
  type Expired,
  openChallenge,
  type Purpose,
  takeChallenge,
} from "../domain/challenge";
import {
  type Invitation,
  invite,
  liveInvitation,
  maySetUp,
  newcomerOf,
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
  isLive,
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
import { can, type Role } from "../domain/rights";
import { type Signed, signIn, signOut, slide, type StaleCounter } from "../domain/session";
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
/** A version of something that is not a member. */
export type UnknownAggregate = { code: "unknown-aggregate"; aggregate: string };

export type AccessError =
  | RateLimited
  | Forbidden
  | LastKeeper
  | SetUp
  | Missing
  | Duplicate
  | CredentialError
  | RedeemError
  | Expired
  | StaleCounter;

/** The members as one of them sees them. */
export type Roster = {
  members: (Pick<Member, "id" | "name" | "role"> &
    Partial<Member> & { credentials?: Omit<Credential, "publicKey" | "counter">[] })[];
  invitations?: Omit<Invitation, "hash">[];
};

/** A step of signing in as it begins. */
export type NewChallenge = Parameters<typeof openChallenge>[0];

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
    /** The name of the family, kept when it is set up first. */
    family?: string;
  }): Result<Change, AccessError>;
  /** The name of the family, null until it is set up. */
  family(): string | null;
  /** A live credential, with what checks a signature by it. */
  credential(id: string): Credential | null;
  invitation(id: string): Invitation | null;
  /** Whether a setup code, by its hash, may still let a keeper in. */
  maySetUp(code: string): boolean;
  /** Who a live invitation lets in. */
  newcomer(
    hash: string,
    now: number,
    fresh: { id: MemberId; name?: string | undefined },
  ): Result<NewMember, AccessError>;
  /** The members as a member may see them: names for all, credentials and invitations for keepers. */
  roster(by: MemberId): Result<Roster, AccessError>;
  /** What a live invitation is, without spending it. */
  inspect(hash: string, now: number): Result<Invitation, AccessError>;
  /** Begins a step of signing in. */
  openChallenge(input: NewChallenge, now: number): void;
  /** Ends a step of signing in: it is answered once, whatever the answer. */
  takeChallenge<P extends Purpose>(
    hash: string,
    purpose: P,
    now: number,
  ): Result<Extract<Challenge, { purpose: P }>, AccessError>;
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
    counter?: number;
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
  stale(expected: Expected): StaleVersion | UnknownAggregate | null;
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
    family: () => store.family()?.name ?? null,
    credential(id) {
      const found = store.credential(id);
      return isLive(found) ? found : null;
    },
    invitation: (id) => store.invitation(id),
    maySetUp: (code) => maySetUp(store, code),
    newcomer(hash, now, fresh) {
      const live = liveInvitation(store, hash, now);
      if (!live.ok) return live;
      const member = newcomerOf(store, live.value, fresh);
      return member === null ? missing("member") : { ok: true, value: member };
    },
    roster(by) {
      const reader = allowed(store, by, "see-members");
      if (!reader.ok) return reader;
      const members = store.members();
      if (!can(reader.value.role, "manage-members")) {
        const names = members
          .filter((one) => isLive(one))
          .map(({ id, name, role }) => ({ id, name, role }));
        return { ok: true, value: { members: names } };
      }
      return {
        ok: true,
        value: {
          members: members.map((one) => ({
            ...one,
            credentials: store
              .credentialsOf(one.id)
              .map(({ publicKey: _key, counter: _counter, ...credential }) => credential),
          })),
          invitations: store.invitations().map(({ hash: _hash, ...one }) => one),
        },
      };
    },
    inspect: (hash, now) => liveInvitation(store, hash, now),
    openChallenge: (input, now) => store.save(openChallenge(input, now)),
    takeChallenge(hash, purpose, now) {
      const { change, taken } = takeChallenge(store, hash, purpose, now);
      if (change.length > 0) store.save(change);
      return taken;
    },
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
        if (kind !== "member" || more !== undefined || !isId("member", id)) {
          return { code: "unknown-aggregate", aggregate };
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
