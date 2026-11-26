import { defineConfig, devices } from "@playwright/test";

// Passkeys need a domain, and Chromium treats localhost as a secure place: the cookie of a session
// keeps its __Host- name. The browser is told that localhost is the address the Worker listens on.
const baseURL = "http://localhost:8788";

/** The setup code of the Worker of the tests; no installation has it. */
export const SETUP_CODE = "a-setup-code-for-the-browser-tests";

export default defineConfig({
  testDir: "test/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--host-resolver-rules=MAP localhost 127.0.0.1"] },
  },
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
      "wrangler dev --local --ip 127.0.0.1 --port 8788 --var JURISDICTION:none --var SAMPLE:on " +
      // Signing in, with a setup code for tests only.
      `--var RP_ID:localhost --var ORIGIN:${baseURL} --var SETUP_CODE:${SETUP_CODE} ` +
      "--show-interactive-dev-session=false",
    url: "http://127.0.0.1:8788/health",
    env: { WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false" },
    reuseExistingServer: false,
  },
});
