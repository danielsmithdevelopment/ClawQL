import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    colorScheme: 'light',
  },
  webServer: {
    // Next 16+ rejects `next start` when output is standalone (same as Lighthouse CI /
    // Dockerfile). Real monorepo sync + build needs more than 4m on CI.
    command:
      'npm run build && PORT=4173 HOSTNAME=127.0.0.1 npm run start:standalone',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 360_000 : 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
