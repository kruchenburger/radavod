import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Signed } from "../../src/contexts/access";
import { allow, type Api } from "../../src/worker/auth";

describe("a route of the table", () => {
  it("admits a role by the rights alone, whatever the rules behind it would say", async () => {
    for (const [role, status] of [
      ["reader", 403],
      ["editor", 403],
      ["keeper", 200],
    ] as const) {
      const app = new Hono<Api>();
      app.use(async (c, next) => {
        c.set("signed", { role } as Signed);
        await next();
      });
      app.get("/", allow("manage-members"), (c) => c.text("in"));
      expect((await app.request("/")).status, role).toBe(status);
    }
  });
});
