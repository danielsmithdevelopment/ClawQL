import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const dashboardRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: dashboardRoot,
  resolve: {
    alias: {
      '@': path.join(dashboardRoot, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks',
  },
})
