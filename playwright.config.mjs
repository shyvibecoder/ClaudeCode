import { defineConfig } from "@playwright/test";

// Browser DOM e2e — runs in CI (needs a browser). Boots the static server over web/.
export default defineConfig({
  testDir: "tests/e2e-browser",
  timeout: 30000,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3000", headless: true },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
