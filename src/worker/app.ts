import { Hono } from "hono";
import type { Config } from "../shared/config";
import type { Health } from "../shared/health";
import { parseSamplePath, SAMPLE_FILE } from "../shared/sample-path";
import { type Api, gate } from "./auth";
import type { Env } from "./env";
import { memberRoutes } from "./routes/members";
import { signInRoutes } from "./routes/sign-in";
import { FAMILY_ID, stubFor } from "./stub";

export const app = new Hono<Api>();

// Ahead of every route: a changing request comes from the site, and nothing but signing in is open
// without a session.
app.use("/api/*", gate);
signInRoutes(app);
memberRoutes(app);
// Whatever else a member asks of `/api` is not there yet.
app.all("/api/*", (c) => c.json({ error: "not-found" }, 404));

app.get("/health", async (c) => {
  const [tree, access] = await Promise.all([
    check("tree", async () => stubFor(c.env.TREE, FAMILY_ID, c.env).ping()),
    check("access", async () => stubFor(c.env.ACCESS, FAMILY_ID, c.env).ping()),
  ]);
  const ok = tree === "ok" && access === "ok";
  const health: Health = { status: ok ? "ok" : "error", version: c.env.APP_VERSION, tree, access };
  return c.json(health, ok ? 200 : 503);
});

app.get("/config", (c) => {
  const config: Config = { sample: hasSample(c.env) };
  return c.json(config, 200, { "cache-control": "no-store" });
});

// Browsers and readers ask for the icon here whatever the page says; the icon is a drawing.
app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));

// The app reads the address itself; every screen is the same page. The tree itself is a file.
app.on("GET", ["/sample", "/sample/*"], (c) => {
  const url = new URL(c.req.url);
  if (!hasSample(c.env)) return c.notFound();
  if (url.pathname === SAMPLE_FILE) return c.env.ASSETS.fetch(c.req.raw);
  if (parseSamplePath(url.pathname) === null) return c.notFound();
  return c.env.ASSETS.fetch(new Request(new URL("/", url), c.req.raw));
});

/** Anything but "on" is off, a typo too: the example never opens by chance. */
function hasSample({ SAMPLE }: Pick<Env, "SAMPLE">): boolean {
  return SAMPLE === "on";
}

async function check(name: string, ping: () => Promise<"ok">): Promise<"ok" | "error"> {
  try {
    return await ping();
  } catch (error) {
    console.error(`health: ${name} is down`, error);
    return "error";
  }
}
