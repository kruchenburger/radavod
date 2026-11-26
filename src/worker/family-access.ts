import { DurableObject } from "cloudflare:workers";
import {
  type Access,
  type AccessError,
  type Challenge,
  type Change,
  type Credential,
  type Invitation,
  type NewChallenge,
  type Purpose,
  type Roster,
  type Expected,
  type StaleVersion,
  type UnknownAggregate,
  accessOver,
  type ErasureLedger,
  type Limit,
  type LogEntry,
  type Member,
  migrateAccess,
  type NewCredential,
  type NewMember,
  type RateLimited,
  type Role,
  type Signed,
  sqliteAccess,
  sqliteLedger,
} from "../contexts/access";
import type { MemberId, PersonId } from "../kernel/id";
import type { Result } from "../kernel/result";
import type { Env } from "./env";

const day = 86_400_000;

type Done<T = null> = Result<T, AccessError | StaleVersion | UnknownAggregate>;

/** Members and sign-in, kept apart so that rolling the tree back never revives a revoked role. */
export class FamilyAccess extends DurableObject<Env> {
  readonly #ledger: ErasureLedger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrateAccess(ctx.storage);
    this.#ledger = sqliteLedger(ctx.storage.sql);
  }

  ping(): "ok" {
    return "ok";
  }

  /**
   * Remembers who is erased from the tree, for the tree to ask after a rollback. Members and
   * invitations tied to them are tied to nobody now.
   */
  remember(ids: PersonId[]): void {
    this.ctx.storage.transactionSync(() => {
      this.#ledger.remember(ids);
      this.#access().forget(ids);
    });
  }

  erased(): PersonId[] {
    return this.#ledger.all();
  }

  isSetUp(): boolean {
    return this.#access().isSetUp();
  }

  members(): Member[] {
    return this.#access().members();
  }

  /** The credentials of a member, without the keys of passkeys: nobody outside needs them. */
  /** A live credential, with what checks a signature by it. */
  credential(id: string): Credential | null {
    return this.#access().credential(id);
  }

  roster(by: MemberId): Result<Roster, AccessError> {
    return this.#access().roster(by);
  }

  newcomer(
    hash: string,
    now: number,
    fresh: { id: MemberId; name?: string | undefined },
  ): Result<NewMember, AccessError> {
    return this.#access().newcomer(hash, now, fresh);
  }

  maySetUp(code: string): boolean {
    return this.#access().maySetUp(code);
  }

  family(): string | null {
    return this.#access().family();
  }

  /** What a live invitation is, without spending it. */
  inspect(hash: string, now: number): Result<Invitation, AccessError> {
    return this.#access().inspect(hash, now);
  }

  invitations(by: MemberId): Result<Invitation[], AccessError> {
    return this.#access().invitations(by);
  }

  openChallenge(input: NewChallenge, now: number): Promise<Done> {
    return this.#change({}, (access) => {
      access.openChallenge(input, now);
      return { ok: true, value: null };
    });
  }

  takeChallenge<P extends Purpose>(
    hash: string,
    purpose: P,
    now: number,
  ): Result<Extract<Challenge, { purpose: P }>, AccessError> {
    return this.ctx.storage.transactionSync(() => this.#access().takeChallenge(hash, purpose, now));
  }

  setUp(input: {
    member: NewMember;
    credential: NewCredential;
    now: number;
    code: string;
    family?: string;
  }): Promise<Done> {
    return this.#change({}, (access) => access.setUp(input));
  }

  invite(
    by: MemberId,
    input: { id: string; hash: string; role: Role; person: PersonId | null; now: number },
  ): Promise<Done<{ expiresAt: number }>> {
    return this.#run({}, (access) => given(access, access.invite(by, input), input.id));
  }

  recover(
    by: MemberId,
    input: { id: string; hash: string; member: MemberId; now: number },
    expected: Expected = {},
  ): Promise<Done<{ expiresAt: number }>> {
    return this.#run(expected, (access) => given(access, access.recover(by, input), input.id));
  }

  revokeInvitation(by: MemberId, id: string): Promise<Done> {
    return this.#change({}, (access) => access.revokeInvitation(by, id));
  }

  redeem(input: {
    hash: string;
    now: number;
    member?: NewMember;
    credential: NewCredential;
  }): Promise<Done<MemberId>> {
    return this.#run({}, (access) => access.redeem(input));
  }

  addCredential(id: MemberId, credential: NewCredential, now: number): Promise<Done> {
    return this.#change({}, (access) => access.addCredential(id, credential, now));
  }

  revokeCredential(by: MemberId, id: string, now: number): Promise<Done> {
    return this.#change({}, (access) => access.revokeCredential(by, id, now));
  }

  changeRole(
    by: MemberId,
    id: MemberId,
    role: Role,
    now: number,
    expected: Expected = {},
  ): Promise<Done> {
    return this.#change(expected, (access) => access.changeRole(by, id, role, now));
  }

  revoke(by: MemberId, id: MemberId, now: number, expected: Expected = {}): Promise<Done> {
    return this.#change(expected, (access) => access.revoke(by, id, now));
  }

  deleteAccount(id: MemberId): Promise<Done> {
    return this.#change({}, (access) => access.deleteAccount(id));
  }

  /** A sign-in. The country is a code Cloudflare gives, never an address. */
  signIn(input: {
    hash: string;
    credential: string;
    now: number;
    country: unknown;
    counter?: number;
  }): Promise<Done> {
    return this.#change({}, (access) => access.signIn(input));
  }

  session(hash: string, now: number): Signed | null {
    return this.ctx.storage.transactionSync(() => this.#access().session(hash, now));
  }

  signOut(hash: string): Promise<Done> {
    return this.#change({}, (access) => access.signOut(hash));
  }

  /** A try of an address, known by a hash; it is hashed again with the salt of this family. */
  async attempt(
    limit: Exclude<Limit, "invite">,
    key: string,
    now: number,
  ): Promise<Result<null, RateLimited | StaleVersion | UnknownAggregate>> {
    const salted = new TextEncoder().encode(`${sqliteAccess(this.ctx.storage.sql).salt()}:${key}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", salted));
    const hashed = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return this.#run({}, (access) => access.attempt(limit, hashed, now));
  }

  log(by: MemberId): Result<LogEntry[], AccessError> {
    return this.#access().log(by);
  }

  /** Takes away sessions, invitations and tries that are over, and comes again while any are left. */
  override async alarm(): Promise<void> {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => this.#access().clean(now));
    await this.#wake();
  }

  #access(): Access {
    return accessOver(sqliteAccess(this.ctx.storage.sql));
  }

  async #change(expected: Expected, work: (access: Access) => Done<unknown>): Promise<Done> {
    const done = await this.#run(expected, work);
    return done.ok ? { ok: true, value: null } : done;
  }

  /** One command in one transaction, after the versions the member saw are checked. */
  async #run<T, E extends { code: string }>(
    expected: Expected,
    work: (access: Access) => Result<T, E>,
  ): Promise<Result<T, E | StaleVersion | UnknownAggregate>> {
    const done = this.ctx.storage.transactionSync(
      (): Result<T, E | StaleVersion | UnknownAggregate> => {
        const access = this.#access();
        const stale = access.stale(expected);
        return stale === null ? work(access) : { ok: false, error: stale };
      },
    );
    if (done.ok) await this.#wake();
    return done;
  }

  /** What expires is cleaned once a day while there is any. */
  async #wake(): Promise<void> {
    if (this.#access().isWaiting() && (await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + day);
    }
  }
}

/** The link a command gave, and when it is over. */
function given<E extends { code: string }>(
  access: Access,
  done: Result<Change, E>,
  id: string,
): Result<{ expiresAt: number }, E> {
  if (!done.ok) return done;
  return { ok: true, value: { expiresAt: access.invitation(id)?.expiresAt ?? 0 } };
}
