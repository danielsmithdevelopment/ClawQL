import { expect, test } from '@playwright/test'

import { getSecretDataKey, kubectlExec, kubectlRun } from './kubectl-helpers.mjs'

const NS = process.env.CLAWQL_DASHBOARD_E2E_NAMESPACE ?? 'clawql-dashboard-e2e'
const DEPLOY = process.env.CLAWQL_DASHBOARD_E2E_DEPLOYMENT ?? 'clawql-dashboard-e2e-target'

test('dashboard form syncs Secret: updates changed keys, removes cleared keys, rollout succeeds', async ({
  page,
}) => {
  test.skip(process.env.CLAWQL_DASHBOARD_E2E !== '1', 'Set CLAWQL_DASHBOARD_E2E=1 (see dashboard/README.md).')

  const secretName =
    process.env.CLAWQL_DASHBOARD_E2E_SECRET_NAME ?? `clawql-dash-e2e-${Date.now()}`
  const specPath = `/tmp/clawql-dashboard-e2e-spec-${Date.now()}.yaml`
  const providerMarker = `e2e-provider-${Date.now()}`
  const specPathPatched = `${specPath}.patched`

  try {
    kubectlExec(['get', 'ns', NS, '-o', 'name'])
  } catch {
    test.skip(true, `kubectl cannot read namespace ${NS} — check KUBE_CONTEXT / cluster access.`)
  }

  try {
    await page.goto('/')

    await page.getByTestId('nav-configuration').click()
    await expect(page.getByRole('heading', { name: 'Cluster targets' })).toBeVisible()

    await page.getByLabel('Namespace', { exact: true }).fill(NS)
    await page.getByLabel('Secret name', { exact: true }).fill(secretName)
    await page.getByLabel('Deployment', { exact: true }).fill(DEPLOY)

    await expect(page.locator('form[data-vault-hydrated="true"]')).toBeVisible({ timeout: 120_000 })

    await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_SPEC_PATH')
    await page.getByTestId('env-field-CLAWQL_SPEC_PATH').fill(specPath)

    await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_PROVIDER')
    await page.getByTestId('env-field-CLAWQL_PROVIDER').fill(providerMarker)

    const vaultReloadAfterSave1 = page.waitForResponse(
      (r) =>
        r.url().includes('/api/k8s/secret-env') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    )
    await page.getByRole('button', { name: /Save to Vault & restart rollout/ }).click()

    await expect(page.getByRole('status')).toContainText('Vault updated and rollout restarted', {
      timeout: 180_000,
    })
    await vaultReloadAfterSave1

    expect(getSecretDataKey(NS, secretName, 'CLAWQL_SPEC_PATH')).toBe(specPath)
    expect(getSecretDataKey(NS, secretName, 'CLAWQL_PROVIDER')).toBe(providerMarker)

    await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_SPEC_PATH')
    await page.getByTestId('env-field-CLAWQL_SPEC_PATH').fill(specPathPatched)

    await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_PROVIDER')
    await page.getByTestId('env-field-CLAWQL_PROVIDER').fill('')

    const vaultReloadAfterSave2 = page.waitForResponse(
      (r) =>
        r.url().includes('/api/k8s/secret-env') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    )
    await page.getByRole('button', { name: /Save to Vault & restart rollout/ }).click()

    await expect(page.getByRole('status')).toContainText('Vault updated and rollout restarted', {
      timeout: 180_000,
    })
    await vaultReloadAfterSave2

    expect(getSecretDataKey(NS, secretName, 'CLAWQL_SPEC_PATH')).toBe(specPathPatched)
    const providerB64 = kubectlExec([
      'get',
      'secret',
      secretName,
      '-n',
      NS,
      '-o=jsonpath={.data.CLAWQL_PROVIDER}',
    ]).trim()
    expect(providerB64).toBe('')
  } finally {
    kubectlRun(['delete', 'secret', secretName, '-n', NS, '--ignore-not-found'])
  }
})

test('pasting .env text into one field hydrates matching dashboard keys', async ({ page }) => {
  test.skip(process.env.CLAWQL_DASHBOARD_E2E !== '1', 'Set CLAWQL_DASHBOARD_E2E=1 (see dashboard/README.md).')

  await page.goto('/')
  await page.getByTestId('nav-configuration').click()
  await expect(page.getByRole('heading', { name: 'Cluster targets' })).toBeVisible()
  await expect(page.locator('form[data-vault-hydrated="true"]')).toBeVisible({ timeout: 120_000 })

  const specValue = `/tmp/e2e-spec-${Date.now()}.yaml`
  const providerValue = `e2e-provider-${Date.now()}`
  const envBlob = `# copied from .env
CLAWQL_SPEC_PATH=${specValue}
CLAWQL_PROVIDER=${providerValue}
UNUSED_VALUE=ignored`

  await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_SPEC_PATH')
  await page.getByTestId('env-field-CLAWQL_SPEC_PATH').fill('')
  await page.getByTestId('env-field-CLAWQL_SPEC_PATH').evaluate((el, text) => {
    const dt = new DataTransfer()
    dt.setData('text', text)
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(ev)
  }, envBlob)

  await expect(page.getByRole('status')).toContainText('Imported 2 values from pasted .env text.', {
    timeout: 15_000,
  })

  await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_SPEC_PATH')
  await expect(page.getByTestId('env-field-CLAWQL_SPEC_PATH')).toHaveValue(specValue)

  await page.getByPlaceholder('Substring match on variable name').fill('CLAWQL_PROVIDER')
  await expect(page.getByTestId('env-field-CLAWQL_PROVIDER')).toHaveValue(providerValue)
})
