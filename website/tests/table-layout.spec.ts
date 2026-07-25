import { expect, test, type Locator, type Page } from '@playwright/test'

const MOBILE_VIEWPORT = { width: 390, height: 844 }

/** Assert header cells in a table do not overlap horizontally. */
async function expectTableHeadersAligned(table: Locator) {
  const headers = table.locator('thead th')
  const count = await headers.count()
  test.skip(count < 2, 'Table has fewer than two columns')

  for (let i = 0; i < count - 1; i++) {
    const left = await headers.nth(i).boundingBox()
    const right = await headers.nth(i + 1).boundingBox()
    expect(left, `header ${i} missing box`).not.toBeNull()
    expect(right, `header ${i + 1} missing box`).not.toBeNull()
    if (left && right) {
      expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1)
    }
  }
}

async function expectDocsTablePresent(page: Page) {
  const table = page.locator('.docs-table').first()
  await expect(table).toBeVisible()
  await expectTableHeadersAligned(table)
}

test.describe('mobile table layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
  })

  const tableHeavyRoutes = [
    { path: '/inference/clawql-inference', name: 'inference' },
    { path: '/architecture/token-efficiency', name: 'token efficiency' },
    { path: '/architecture/enterprise-ontology', name: 'enterprise ontology' },
    { path: '/specs/cq-extensions', name: 'cq extensions' },
    { path: '/security/defense-in-depth', name: 'defense in depth' },
    { path: '/plugins', name: 'plugin registry' },
    { path: '/plugins/bundled-providers', name: 'bundled providers plugin' },
    { path: '/vision/roadmap', name: 'vision roadmap' },
    { path: '/deployment/operations-guide', name: 'deployment operations' },
    { path: '/tools', name: 'tools reference' },
    { path: '/bundled-specs', name: 'bundled specs' },
    { path: '/learn/document-pipeline', name: 'document pipeline' },
    {
      path: '/case-studies/cloudflare-docs-mcp',
      name: 'cloudflare case study',
    },
  ]

  for (const { path, name } of tableHeavyRoutes) {
    test(`${name} tables are left-aligned without column overlap`, async ({
      page,
    }) => {
      await page.goto(path)
      await expectDocsTablePresent(page)
    })
  }
})
