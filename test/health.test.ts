import { exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { app } from "../src/worker/app";
import type { Env } from "../src/worker/env";

it("reports version and both objects", async () => {
  const res = await exports.default.fetch("https://x/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: "dev", tree: "ok", access: "ok" });
});

it("reports which object is down", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const namespace = (ping: () => Promise<"ok">) => ({ getByName: () => ({ ping }) });
  const env = {
    TREE: namespace(() => Promise.reject(new Error("secret detail"))),
    ACCESS: namespace(() => Promise.resolve("ok")),
    APP_VERSION: "dev",
    JURISDICTION: "none",
  } as unknown as Env;
  const res = await app.request("/health", {}, env);
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({
    status: "error",
    version: "dev",
    tree: "error",
    access: "ok",
  });
  expect(log).toHaveBeenCalledOnce();
});

it("rejects unknown API routes without a session", async () => {
  expect((await exports.default.fetch("https://x/api/people")).status).toBe(401);
});

it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
  "rejects %s on any API route",
  async (method) => {
    for (const path of ["/api", "/api/", "/api/people", "/api/people/1/names", "/api/%70eople"]) {
      expect((await exports.default.fetch(`https://x${path}`, { method })).status, path).toBe(401);
    }
  },
);

it.each(["/", "/people", "/apix", "/health/more", "//api/people"])(
  "knows no page at %s",
  async (path) => {
    expect((await exports.default.fetch(`https://x${path}`)).status).toBe(404);
  },
);

it("denies API requests before any other route can answer", () => {
  expect(app.routes[0]).toMatchObject({ method: "ALL", path: "/api/*" });
});

it.each(["/setup", "/join", "/sign-in", "/family", "/account"])(
  "serves the app at %s, never inside another site",
  async (path) => {
    const res = await exports.default.fetch(`https://x${path}`);
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  },
);
