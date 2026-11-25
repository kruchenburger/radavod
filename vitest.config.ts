import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // Tests never reach Cloudflare.
            remoteBindings: false,
            // Local workerd has no jurisdictions.
            miniflare: { bindings: { JURISDICTION: "none" } },
          }),
        ],
        test: { name: "worker", include: ["test/**/*.test.ts"] },
      },
      {
        test: {
          name: "guards",
          environment: "node",
          include: ["guards/**/*.test.ts", "examples/**/*.test.ts"],
          exclude: ["guards/**/fixtures/**"],
        },
      },
    ],
  },
});
