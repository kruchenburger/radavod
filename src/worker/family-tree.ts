import { DurableObject } from "cloudflare:workers";
import { migrate } from "../contexts/history";
import type { Ledger } from "../scenarios/erase";
import { type Changes, type Packed, snapshotsOf, type TreeSnapshots } from "../scenarios/snapshot";
import { type UnitOfWork, unitOfWork } from "../scenarios/unit-of-work";
import { type Versions, versionsOf } from "../scenarios/versions";
import type { Env } from "./env";
import { steps } from "./schema";
import { FAMILY_ID, stubFor } from "./stub";

/** Edits come in bursts: the snapshot is made once the tree has been still this long. */
const stillFor = 2_000;

/** Every context but access, in one database. */
export class FamilyTree extends DurableObject<Env> {
  /** Scenarios run here. A property of an instance is not a method anybody can call from outside. */
  protected readonly unitOfWork: UnitOfWork;
  protected readonly versions: Versions;
  protected readonly ledger: Ledger;
  protected readonly snapshots: TreeSnapshots;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrate(ctx.storage, steps);
    // Each edit puts the alarm off, so a burst of them makes one snapshot.
    this.unitOfWork = unitOfWork(
      ctx.storage,
      () => void ctx.storage.setAlarm(Date.now() + stillFor),
    );
    this.versions = versionsOf(ctx.storage, this.unitOfWork);
    this.snapshots = snapshotsOf(ctx.storage, this.unitOfWork);
    const access = () => stubFor(env.ACCESS, FAMILY_ID, env);
    this.ledger = { remember: (ids) => access().remember(ids), all: () => access().erased() };
  }

  ping(): "ok" {
    return "ok";
  }

  /** The tree as the browser gets it. A snapshot the tree is past is made anew first. */
  snapshot(): Promise<Packed> {
    return this.snapshots.snapshot();
  }

  /** What a client with the snapshot of a version must ask for again, or "reload". */
  changesSince(version: number, epoch: string): Changes | "reload" {
    return this.snapshots.changesSince(version, epoch);
  }

  /** Makes the snapshot after edits, so that opening the tree only reads it. */
  override async alarm(): Promise<void> {
    await this.snapshots.snapshot();
  }
}
