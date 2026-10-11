import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseURL = process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040'
const repeatEach = Number(process.env.CLAWQL_CLOUD_E2E_REPEAT ?? '3')

/**
 * Cloud console E2E catalog runner.
 * Expects managed console already up with CLAWQL_E2E_HARNESS=1
 * (or set CLAWQL_CLOUD_E2E_START=1 to spawn with that env).
 * Pass-when asserts production-shaped /v1 /mcp /events /audit — not /api/e2e/*.
 */
export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  testIgnore: ['**/_quarantine/**'],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  repeatEach: Number.isFinite(repeatEach) && repeatEach > 0 ? repeatEach : 3,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'results/catalog-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'results/html') }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.CLAWQL_CLOUD_E2E_START === '1'
    ? {
        command: 'npm run dev',
        cwd: path.join(__dirname, '..'),
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        env: {
          ...process.env,
          CLAWQL_CONSOLE_SURFACE: 'managed',
          CLAWQL_MANAGED_AUTH_MOCK: '1',
          CLAWQL_MANAGED_DATA_SOURCE: process.env.CLAWQL_MANAGED_DATA_SOURCE ?? 'fixture',
          CLAWQL_E2E_HARNESS: '1',
          PORT: '3040',
        },
      }
    : undefined,
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'nightly',
      testMatch: /nightly\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'manual',
      testMatch: /manual\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
