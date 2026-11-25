import { DurableObject } from "cloudflare:workers";
import { migrate } from "../contexts/history";
import { type UnitOfWork, unitOfWork } from "../scenarios/unit-of-work";
import type { Env } from "./env";
import { steps } from "./schema";

/** Every context but access, in one database. */
export class FamilyTree extends DurableObject<Env> {
  /** Scenarios run here. A property of an instance is not a method anybody can call from outside. */
  protected readonly unitOfWork: UnitOfWork;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrate(ctx.storage, steps);
    this.unitOfWork = unitOfWork(ctx.storage);
  }

  ping(): "ok" {
    return "ok";
  }
}
