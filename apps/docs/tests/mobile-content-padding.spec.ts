import { expect, test } from '@playwright/test'

const MOBILE_VIEWPORT = { width: 390, height: 844 }

/** Minimum inset from the viewport edge for readable docs content on mobile. */
const MIN_CONTENT_INSET_PX = 20

test.describe('mobile content padding', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
  })

  const routes = [
    { path: '/agent-setup', heading: 'Local vs cluster secrets' },
    { path: '/deployment/operations-guide', heading: 'Before you start' },
    { path: '/quickstart', heading: '1. Start the MCP server' },
  ]

  for (const { path, heading } of routes) {
    test(`${path} keeps prose inset on mobile`, async ({ page }) => {
      await page.goto(path)

      const headingEl = page.locator('h2, h3').filter({ hasText: heading }).first()
      await expect(headingEl).toBeVisible()
      const headingBox = await headingEl.boundingBox()
      expect(headingBox?.x ?? 0).toBeGreaterThanOrEqual(MIN_CONTENT_INSET_PX)

      const pre = page.locator('.prose pre').first()
      await expect(pre).toBeVisible()
      const preBox = await pre.boundingBox()
      expect(preBox?.x ?? 0).toBeGreaterThanOrEqual(MIN_CONTENT_INSET_PX)

      const table = page.locator('.docs-table-scroll').first()
      if ((await table.count()) > 0) {
        await expect(table).toBeVisible()
        const tableBox = await table.boundingBox()
        expect(tableBox?.x ?? 0).toBeGreaterThanOrEqual(MIN_CONTENT_INSET_PX)
      }
    })
  }
})
