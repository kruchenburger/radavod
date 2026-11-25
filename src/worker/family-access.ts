import { DurableObject } from "cloudflare:workers";
import {
  type Access,
  type AccessError,
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

/** What a member saw: "member/<id>" and its version. A stale one is refused. */
export type Expected = Record<string, number>;

export type StaleVersion = { code: "stale-version"; aggregate: string; current: number };

type Done<T = null> = Result<T, AccessError | StaleVersion>;

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

  setUp(input: {
    member: NewMember;
    credential: NewCredential;
    now: number;
    code: string;
  }): Promise<Done> {
    return this.#change({}, (access) => access.setUp(input));
  }

  invite(
    by: MemberId,
    input: { id: string; hash: string; role: Role; person: PersonId | null; now: number },
  ): Promise<Done> {
    return this.#change({}, (access) => access.invite(by, input));
  }

  recover(
    by: MemberId,
    input: { id: string; hash: string; member: MemberId; now: number },
    expected: Expected = {},
  ): Promise<Done> {
    return this.#change(expected, (access) => access.recover(by, input));
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
  }): Promise<Done> {
    return this.#change({}, (access) => access.signIn(input));
  }

  session(hash: string, now: number): Signed | null {
    return this.ctx.storage.transactionSync(() => this.#access().session(hash, now));
  }

  signOut(hash: string): Promise<Done> {
    return this.#change({}, (access) => access.signOut(hash));
  }

  attempt(
    limit: Limit,
    key: string,
    now: number,
  ): Promise<Result<null, RateLimited | StaleVersion>> {
    return this.#run({}, (access) => access.attempt(limit, key, now));
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
  ): Promise<Result<T, E | StaleVersion>> {
    const done = this.ctx.storage.transactionSync((): Result<T, E | StaleVersion> => {
      const access = this.#access();
      for (const [aggregate, seen] of Object.entries(expected)) {
        const [kind, id = ""] = aggregate.split("/");
        if (kind !== "member") throw new Error("unknown-aggregate");
        const current = access.member(id as MemberId)?.version ?? 0;
        if (current !== seen)
          return { ok: false, error: { code: "stale-version", aggregate, current } };
      }
      return work(access);
    });
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
