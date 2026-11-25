import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:8788";

export default defineConfig({
  testDir: "test/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: devices["Pixel 5"] },
  ],
  webServer: {
    // The built app and the Worker in local workerd, which has no jurisdictions, with the
    // example open. Build first.
    command:
      "wrangler dev --local --ip 127.0.0.1 --port 8788 --var JURISDICTION:none --var SAMPLE:on --show-interactive-dev-session=false",
    url: `${baseURL}/health`,
    env: { WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false" },
    reuseExistingServer: false,
  },
});
