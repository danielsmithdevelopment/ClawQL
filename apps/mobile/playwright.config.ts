import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.CLAWQL_MOBILE_E2E_PORT ?? 4173);
const baseURL = process.env.CLAWQL_MOBILE_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    ...devices["iPhone 14"],
    // Chromium + iPhone viewport (parity with record-parity-demo; avoids WebKit browser download).
    browserName: "chromium",
    trace: "on-first-retry",
  },
  webServer: {
    command: `npx --yes serve dist-web -l ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
