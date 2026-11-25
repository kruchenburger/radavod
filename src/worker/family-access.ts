import { DurableObject } from "cloudflare:workers";
import { type ErasureLedger, sqliteLedger } from "../contexts/access";
import type { PersonId } from "../kernel/id";
import type { Env } from "./env";

/** Members and sign-in, kept apart so that rolling the tree back never revives a revoked role. */
export class FamilyAccess extends DurableObject<Env> {
  readonly #ledger: ErasureLedger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#ledger = sqliteLedger(ctx.storage.sql);
  }

  ping(): "ok" {
    return "ok";
  }

  /** Remembers who is erased from the tree, for the tree to ask after a rollback. */
  remember(ids: PersonId[]): void {
    this.#ledger.remember(ids);
  }

  erased(): PersonId[] {
    return this.#ledger.all();
  }
}
