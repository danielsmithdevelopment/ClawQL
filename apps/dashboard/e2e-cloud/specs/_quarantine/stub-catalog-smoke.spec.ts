import { test, expect } from '@playwright/test'

import { CLOUD_E2E_SCENARIOS } from '../../catalog/scenarios'
import { runScenario } from '../../helpers/scenario'
import {
  SIDEBAR_ROUTES,
  clickAllTabs,
  expectNoPageError,
  openManagedConsole,
} from '../../helpers/console'

const smokeIds = CLOUD_E2E_SCENARIOS.filter((s) => s.run === 'Smoke').map((s) => s.id)

/**
 * Smoke catalog: every Smoke ID through the public harness surface.
 * UX-01 additionally walks the console the way a person would.
 */
for (const id of smokeIds) {
  if (id === 'UX-01') continue
  test(`${id} harness pass-when`, async () => {
    const result = await runScenario(id)
    expect(result.ok, result.error ?? JSON.stringify(result.details)).toBe(true)
  })
}

test('UX-01 Open every sidebar item and every tab', async ({ page }) => {
  const harness = await runScenario('UX-01')
  expect(harness.ok).toBe(true)

  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await openManagedConsole(page)

  for (const route of SIDEBAR_ROUTES) {
    const nav = page.getByTestId(route.testId)
    await expect(nav).toBeVisible()
    await expect(nav).toHaveAttribute('href', route.href)
    // Prefer sidebar click; fall back to goto if client nav flakes under HMR.
    await nav.click()
    const urlRe = route.href === '/' ? /\/(?:\?.*)?$/ : new RegExp(`${route.href.replace(/\//g, '\\/')}(?:\\?.*)?$`)
    try {
      await expect(page).toHaveURL(urlRe, { timeout: 8_000 })
    } catch {
      await page.goto(route.href)
      await expect(page).toHaveURL(urlRe)
    }
    await expectNoPageError(page)
    if (route.href === '/') {
      await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()
    } else {
      await expect(
        page.locator('header').getByText(new RegExp(route.crumb), { exact: false }).first(),
      ).toBeVisible()
    }
    await clickAllTabs(page, route.href)
  }

  const profile = page.getByTestId('managed-nav-profile')
  await expect(profile).toHaveAttribute('href', '/profile')
  await profile.click()
  try {
    await expect(page).toHaveURL(/\/profile/, { timeout: 8_000 })
  } catch {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/profile/)
  }
  await expectNoPageError(page)

  expect(consoleErrors.filter((e) => !e.includes('favicon'))).toEqual([])
})
