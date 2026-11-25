import { Hono } from "hono";
import type { Health } from "../shared/health";
import type { Env } from "./env";
import { FAMILY_ID, stubFor } from "./stub";

export const app = new Hono<{ Bindings: Env }>();

// Default deny, ahead of every route: no session exists yet, so no data route is open.
app.all("/api/*", (c) => c.json({ error: "unauthorized" }, 401));

app.get("/health", async (c) => {
  const [tree, access] = await Promise.all([
    check("tree", async () => stubFor(c.env.TREE, FAMILY_ID, c.env).ping()),
    check("access", async () => stubFor(c.env.ACCESS, FAMILY_ID, c.env).ping()),
  ]);
  const ok = tree === "ok" && access === "ok";
  const health: Health = { status: ok ? "ok" : "error", version: c.env.APP_VERSION, tree, access };
  return c.json(health, ok ? 200 : 503);
});

async function check(name: string, ping: () => Promise<"ok">): Promise<"ok" | "error"> {
  try {
    return await ping();
  } catch (error) {
    console.error(`health: ${name} is down`, error);
    return "error";
  }
}
