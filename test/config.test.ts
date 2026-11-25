import { expect, it } from "vitest";
import raw from "../wrangler.jsonc?raw";

const config = JSON.parse(raw) as Record<string, unknown> & { vars: Record<string, string> };

it("keeps family data in the eu unless an installation says otherwise", () => {
  expect(config.vars.JURISDICTION).toBe("eu");
});

it("publishes nothing by itself", () => {
  expect(config.workers_dev).toBe(false);
  expect(config.preview_urls).toBe(false);
});

it.each(["account_id", "route", "routes", "env", "zone_id", "secrets_store_secrets"])(
  "holds no deployment setting %s",
  (key) => {
    expect(config).not.toHaveProperty(key);
  },
);

it("sends every API and health request to the Worker, not to the assets", () => {
  expect(config.assets).toMatchObject({ run_worker_first: ["/api/*", "/health"] });
});
