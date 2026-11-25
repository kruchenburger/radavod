import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/** Every context but access, in one database. */
export class FamilyTree extends DurableObject<Env> {
  ping(): "ok" {
    return "ok";
  }
}
