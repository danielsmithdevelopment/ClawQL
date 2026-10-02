import { expect, test } from '@playwright/test'

test('docs search opens and returns results', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: /Search documentation/i }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const input = dialog.getByPlaceholder(/Search documentation/i)
  await expect(input).toBeFocused()
  await input.fill('helm')

  await expect(dialog.locator('li').first()).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText(/helm/i).first()).toBeVisible()
})
