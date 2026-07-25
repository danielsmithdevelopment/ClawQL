import { expect, test } from '@playwright/test'

test('homepage renders and includes ClawQL text', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/ClawQL/i)
  await expect(
    page.getByRole('heading', { name: /ClawQL/i }).first(),
  ).toBeVisible()
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

test('plugins hub is reachable', async ({ page }) => {
  await page.goto('/plugins')
  const main = page.locator('#main-content')
  await expect(main.getByRole('heading', { name: /^Plugins$/ })).toBeVisible()
  await expect(
    main.getByRole('heading', { name: /How to read this catalog/i }),
  ).toBeVisible()
  await expect(
    main.getByRole('heading', { name: /Plugin registry/i }),
  ).toBeVisible()
  await expect(main.getByLabel(/Search registry/i)).toBeVisible()
  await expect(
    main.getByRole('button', { name: /Domain verticals/i }),
  ).toBeVisible()
  await expect(main.getByRole('link', { name: /^Lending$/ })).toBeVisible()
  await expect(main.getByText(/Verticals = presets/i)).toBeVisible()
})

test('plugins registry filters domain verticals', async ({ page }) => {
  await page.goto('/plugins')
  const main = page.locator('#main-content')
  await main.getByRole('button', { name: /Domain verticals/i }).click()
  await expect(main.getByRole('link', { name: /^Lending$/ })).toBeVisible()
  await expect(main.getByText(/Composes/i).first()).toBeVisible()
  await expect(main.getByText(/Boilerplate/i).first()).toBeVisible()
  await expect(
    main.getByRole('link', { name: /^Memory \(vault\)$/ }),
  ).toHaveCount(0)
})
