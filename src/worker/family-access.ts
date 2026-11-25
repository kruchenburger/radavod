import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/** Members and sign-in, kept apart so that rolling the tree back never revives a revoked role. */
export class FamilyAccess extends DurableObject<Env> {
  ping(): "ok" {
    return "ok";
  }
}
