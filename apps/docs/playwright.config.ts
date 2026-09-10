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
    command: 'npm run build && npm run start -- -p 4173 -H 127.0.0.1',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    // prebuild sync + Next build can exceed 2m on CI after plugin page generation
    timeout: process.env.CI ? 240_000 : 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
