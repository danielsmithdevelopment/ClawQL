import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const e2eEnabled = process.env.CLAWQL_DASHBOARD_E2E === '1'
const e2eBaseURL = 'http://127.0.0.1:3041'

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: e2eEnabled ? path.join(__dirname, 'e2e/global-setup.mjs') : undefined,
  globalTeardown: e2eEnabled ? path.join(__dirname, 'e2e/global-teardown.mjs') : undefined,
  use: {
    baseURL: e2eEnabled ? e2eBaseURL : 'http://127.0.0.1:3040',
    trace: 'on-first-retry',
  },
  webServer: e2eEnabled
    ? {
        /** `next start` avoids `.next/dev/lock` collisions with a developer's `next dev` on port 3040. */
        command: 'npm run build && npx next start --port 3041 --hostname 127.0.0.1',
        url: `${e2eBaseURL}/api/k8s/health`,
        reuseExistingServer: false,
        timeout: 300_000,
        env: {
          ...process.env,
          CLAWQL_DASHBOARD_ALLOW_K8S_SYNC: '1',
        },
      }
    : undefined,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
