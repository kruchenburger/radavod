import { cloudflareTest } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
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
        test: { name: "worker", include: ["test/**/*.test.ts"], exclude: ["test/web/**"] },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["test/web/**/*.test.{ts,tsx}"],
          setupFiles: ["test/web/setup.ts"],
          css: true,
        },
      },
      {
        test: {
          name: "guards",
          environment: "node",
          include: ["guards/**/*.test.ts"],
          exclude: ["guards/**/fixtures/**"],
        },
      },
    ],
  },
});
