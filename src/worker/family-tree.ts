import { DurableObject } from "cloudflare:workers";
import { migrate } from "../contexts/history";
import type { Ledger } from "../scenarios/erase";
import { type UnitOfWork, unitOfWork } from "../scenarios/unit-of-work";
import { type Versions, versionsOf } from "../scenarios/versions";
import type { Env } from "./env";
import { steps } from "./schema";
import { FAMILY_ID, stubFor } from "./stub";

/** Every context but access, in one database. */
export class FamilyTree extends DurableObject<Env> {
  /** Scenarios run here. A property of an instance is not a method anybody can call from outside. */
  protected readonly unitOfWork: UnitOfWork;
  protected readonly versions: Versions;
  protected readonly ledger: Ledger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrate(ctx.storage, steps);
    this.unitOfWork = unitOfWork(ctx.storage);
    this.versions = versionsOf(ctx.storage, this.unitOfWork);
    const access = () => stubFor(env.ACCESS, FAMILY_ID, env);
    this.ledger = { remember: (ids) => access().remember(ids), all: () => access().erased() };
  }

  ping(): "ok" {
    return "ok";
  }
}
