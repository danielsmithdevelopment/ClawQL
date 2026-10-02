import { expect, test } from '@playwright/test'

import { getSecretDataKey, kubectlExec, kubectlRun } from './kubectl-helpers.mjs'

const NS = process.env.CLAWQL_DASHBOARD_E2E_NAMESPACE ?? 'clawql-dashboard-e2e'
const DEPLOY = process.env.CLAWQL_DASHBOARD_E2E_DEPLOYMENT ?? 'clawql-dashboard-e2e-target'

test('dashboard provider form syncs Secret: updates changed keys, removes cleared keys, rollout succeeds', async ({
  page,
}) => {
  test.skip(process.env.CLAWQL_DASHBOARD_E2E !== '1', 'Set CLAWQL_DASHBOARD_E2E=1 (see dashboard/README.md).')

  const secretName =
    process.env.CLAWQL_DASHBOARD_E2E_SECRET_NAME ?? `clawql-dash-e2e-${Date.now()}`
  const paperlessMarker = `e2e-paperless-${Date.now()}`
  const onyxMarker = `e2e-onyx-${Date.now()}`
  const paperlessPatched = `${paperlessMarker}-patched`

  try {
    kubectlExec(['get', 'ns', NS, '-o', 'name'])
  } catch {
    test.skip(true, `kubectl cannot read namespace ${NS} — check KUBE_CONTEXT / cluster access.`)
  }

  try {
    await page.goto('/')

    await page.getByTestId('nav-configuration').click()
    await expect(page.getByRole('heading', { name: 'Provider API keys' })).toBeVisible()

    await page.getByText('Advanced cluster targets').click()
    await page.getByLabel('Namespace', { exact: true }).fill(NS)
    await page.getByLabel('Secret name', { exact: true }).fill(secretName)
    await page.getByLabel('Deployment', { exact: true }).fill(DEPLOY)

    await expect(page.locator('form[data-vault-hydrated="true"]')).toBeVisible({ timeout: 120_000 })

    await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Paperless')
    await page.getByTestId('provider-field-PAPERLESS_API_TOKEN').fill(paperlessMarker)

    await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Onyx')
    await page.getByTestId('provider-field-ONYX_API_TOKEN').fill(onyxMarker)

    const vaultReloadAfterSave1 = page.waitForResponse(
      (r) =>
        r.url().includes('/api/k8s/secret-env') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    )
    await page.getByRole('button', { name: /Save & apply/ }).click()

    await expect(page.getByRole('status')).toContainText('Saved to Vault', {
      timeout: 180_000,
    })
    await vaultReloadAfterSave1

    expect(getSecretDataKey(NS, secretName, 'PAPERLESS_API_TOKEN')).toBe(paperlessMarker)
    expect(getSecretDataKey(NS, secretName, 'ONYX_API_TOKEN')).toBe(onyxMarker)

    await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Paperless')
    await page.getByTestId('provider-field-PAPERLESS_API_TOKEN').fill(paperlessPatched)

    await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Onyx')
    await page.getByTestId('provider-field-ONYX_API_TOKEN').fill('')

    const vaultReloadAfterSave2 = page.waitForResponse(
      (r) =>
        r.url().includes('/api/k8s/secret-env') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    )
    await page.getByRole('button', { name: /Save & apply/ }).click()

    await expect(page.getByRole('status')).toContainText('Saved to Vault', {
      timeout: 180_000,
    })
    await vaultReloadAfterSave2

    expect(getSecretDataKey(NS, secretName, 'PAPERLESS_API_TOKEN')).toBe(paperlessPatched)
    const onyxB64 = kubectlExec([
      'get',
      'secret',
      secretName,
      '-n',
      NS,
      '-o=jsonpath={.data.ONYX_API_TOKEN}',
    ]).trim()
    expect(onyxB64).toBe('')
  } finally {
    kubectlRun(['delete', 'secret', secretName, '-n', NS, '--ignore-not-found'])
  }
})

test('pasting .env text into one field hydrates matching provider keys', async ({ page }) => {
  test.skip(process.env.CLAWQL_DASHBOARD_E2E !== '1', 'Set CLAWQL_DASHBOARD_E2E=1 (see dashboard/README.md).')

  await page.goto('/')
  await page.getByTestId('nav-configuration').click()
  await expect(page.getByRole('heading', { name: 'Provider API keys' })).toBeVisible()
  await expect(page.locator('form[data-vault-hydrated="true"]')).toBeVisible({ timeout: 120_000 })

  const paperlessValue = `e2e-paperless-${Date.now()}`
  const onyxValue = `e2e-onyx-${Date.now()}`
  const envBlob = `# copied from .env
PAPERLESS_API_TOKEN=${paperlessValue}
ONYX_API_TOKEN=${onyxValue}
UNUSED_VALUE=ignored`

  await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Paperless')
  await page.getByTestId('provider-field-PAPERLESS_API_TOKEN').fill('')
  await page.getByTestId('provider-field-PAPERLESS_API_TOKEN').evaluate((el, text) => {
    const dt = new DataTransfer()
    dt.setData('text', text)
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(ev)
  }, envBlob)

  await expect(page.getByRole('status')).toContainText('Imported 2 provider credentials', {
    timeout: 15_000,
  })

  await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Paperless')
  await expect(page.getByTestId('provider-field-PAPERLESS_API_TOKEN')).toHaveValue(paperlessValue)

  await page.getByPlaceholder('GitHub, Paperless, Nextcloud…').fill('Onyx')
  await expect(page.getByTestId('provider-field-ONYX_API_TOKEN')).toHaveValue(onyxValue)
})
