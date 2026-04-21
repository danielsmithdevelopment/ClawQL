import { expect, test } from '@playwright/test'

test('homepage renders and includes ClawQL text', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/ClawQL/i)
  await expect(page.getByRole('heading', { name: /ClawQL/i }).first()).toBeVisible()
})

test('health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toMatchObject({ status: 'ok' })
})

test('case-study page is reachable', async ({ page }) => {
  await page.goto('/case-studies/cloudflare-docs-mcp')
  await expect(page.getByRole('heading').first()).toBeVisible()
})
