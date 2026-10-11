/**
 * Real Nightly E2E — honest witnesses via production-shaped /v1 /mcp /events /audit ( /api/e2e arrange/fault only) + webhook :4091 + UI.
 * Never uses POST /api/e2e/scenario or runScenario as pass criteria.
 */
import { test, expect } from '@playwright/test'

import { KEYS, mcpCallTool, mcpListTools, openaiChat } from '../../harness/agent-driver.mjs'
import { openManagedConsole } from '../../helpers/console'
import {
  approveReview,
  control,
  createSubscription,
  decisionCall,
  eraseSubject,
  fetchAsOrg,
  getAudit,
  getCrm,
  getDocuments,
  getInboundStats,
  getOrg,
  getSettings,
  getUsage,
  getWebhookDeliveries,
  keysApi,
  listEvents,
  listReview,
  listSubscriptions,
  memoryGet,
  memoryPost,
  memorySearch,
  openaiChatWithIp,
  postEvents,
  postInbound,
  redeliverEvent,
  resetWebhookReceiver,
  resetWorld,
  retryAllEvents,
  searchErased,
  setWebhookMode,
  settingsMutate,
  stripeCheckout,
  subscriptionAction,
  systemOne,
  uploadDocument,
  waitForDeliveries,
} from '../../helpers/harness'
import {
  approveReviewViaCdp,
  issueApiKeyViaCdpStepUp,
  registerSecurityKeyViaCdp,
} from '../../helpers/webauthn-ceremony'

const NORTHWIND = { contract: 'northwind', annualValue: 52000 } as const
const PII = 'Contact jane.okafor@example.com or call 415-555-0199. Bank 123456789012345.'

test.beforeEach(async () => {
  await resetWorld()
})

test('KEY-02 Register synced passkey shows Sign-in only', async ({ page }) => {
  await page.goto('/profile')
  const reg = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'synced',
    label: 'iCloud passkey',
  })
  expect(reg.status).toBe(200)

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) => e.action === 'security_key.register' && e.outcome === 'Sign-in only',
    ),
  ).toBe(true)

  await page.reload()
  await expect(
    page.locator('[data-testid="profile-security-key"][data-key-label="iCloud passkey"]'),
  ).toHaveAttribute('data-key-badge', 'Sign-in only')
})

test('KEY-03 Marcus needs 2; Remind notifies', async () => {
  // Arrange: Marcus already needs 2 in seed world; remind is arrange.
  await keysApi({ action: 'remind', person: 'Marcus Lee' })

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) =>
        e.action === 'security_key.remind' &&
        e.outcome === 'Reminded' &&
        (e.meta as { person?: string } | undefined)?.person === 'Marcus Lee',
    ),
  ).toBe(true)
})

test('KEY-04 Cannot remove key below two-key rule', async () => {
  const listed = await keysApi()
  const dana = (listed.body.people as { name: string; keys: { id: string }[] }[]).find(
    (p) => p.name === 'Dana Reyes',
  )
  // Arrange: attempt remove
  await keysApi({ action: 'remove', person: 'Dana Reyes', keyId: dana?.keys[0]?.id })

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) => e.action === 'security_key.remove' && /two-key/i.test(e.outcome),
    ),
  ).toBe(true)
})

test('KEY-05 Recovery code once then reuse rejected', async ({ page }) => {
  await resetWorld()
  await control({ securityKeysRegistered: false, markFirstRun: 1 })
  await page.goto('/profile')
  const r1 = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'Recovery A',
  })
  const r2 = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'Recovery B',
    authenticator: r1.authenticator,
  })
  expect(r1.status).toBe(200)
  expect(r2.status).toBe(200)
  const recovery =
    ((r2.body.recoveryCodes as string[]) ?? (r1.body.recoveryCodes as string[]) ?? [])
  expect(recovery.length).toBeGreaterThan(0)
  const code = recovery[0]!

  await control({ useRecoveryCode: code })
  const reuse = await control({ useRecoveryCode: code })
  expect(reuse.status).toBe(403)

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'recovery.use' && e.outcome === 'Accepted once')).toBe(
    true,
  )
  expect(
    audit.entries.some(
      (e) => e.action === 'recovery.use' && /Rejected/i.test(e.outcome),
    ),
  ).toBe(true)
})

test('KEY-06 Regenerated recovery codes reject old code', async ({ page }) => {
  await control({ securityKeysRegistered: false, markFirstRun: 1 })
  await page.goto('/profile')
  const r1 = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'Regen A',
  })
  const r2 = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'Regen B',
    authenticator: r1.authenticator,
  })
  const old =
    ((r2.body.recoveryCodes as string[]) ?? (r1.body.recoveryCodes as string[]) ?? [])[0]!
  await control({ regenerateRecoveryCodes: true })
  const reuse = await control({ useRecoveryCode: old })
  expect(reuse.status).toBe(403)

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'recovery.regenerate')).toBe(true)
  expect(
    audit.entries.some(
      (e) => e.action === 'recovery.use' && /Rejected/i.test(e.outcome),
    ),
  ).toBe(true)
})

test('KEY-07 Issue without user verification creates no key', async ({ page }) => {
  await control({ registerSecurityKeys: { person: 'Dana Reyes', count: 2 } })
  await page.goto('/profile')
  const issued = await issueApiKeyViaCdpStepUp({
    page,
    name: 'no-uv-key',
    userVerified: false,
  })
  expect(issued.status).toBe(403)

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) => e.action === 'key.issue' && /needs PIN or fingerprint/i.test(e.outcome),
    ),
  ).toBe(true)
  expect(audit.entries.some((e) => e.action === 'key.issue' && e.outcome === 'Issued')).toBe(false)
})

test('KEY-08 Cancel step-up at key prompt — nothing changes', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  // Arrange: cancel at key prompt (not Pass-when)
  await approveReview({ requestId, actor: 'Dana Reyes', cancel: true })

  const audit = await getAudit()
  expect(audit.entries.some((e) => /Cancelled at key prompt/i.test(e.outcome))).toBe(true)
  expect(
    audit.entries.some((e) => e.action === 'review.approve' && /Mandate issued/i.test(e.outcome)),
  ).toBe(false)
})

test('KEY-09 Org delete without fresh sign-in asks to sign in again', async ({ page }) => {
  // Arrange: age Dana's session past the 5-minute fresh-sign-in window.
  await control({ ageSession: { person: 'Dana Reyes', minutesAgo: 6 } })

  await page.goto('/settings')
  await page.getByTestId('settings-nav-advanced').click()
  await page.getByTestId('settings-delete-org').click()
  await expect(page.getByTestId('settings-delete-org-message')).toContainText(/sign in again/i)

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) =>
        e.action === 'org.delete' && /sign in again before the key prompt/i.test(e.outcome),
    ),
  ).toBe(true)
  expect(
    audit.entries.some((e) => e.action === 'org.delete' && /Deletion complete/i.test(e.outcome)),
  ).toBe(false)
})

test('KEY-10 Approval with disallowed AAGUID refused; still waiting', async ({ page }) => {
  await page.goto('/profile')
  const reg = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'EvilAaguid Key',
  })
  expect(reg.status).toBe(200)
  await control({
    setAaguid: { person: 'Dana Reyes', label: 'EvilAaguid Key', aaguid: 'aagu_evil_clone' },
  })

  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const bad = await approveReviewViaCdp({
    page,
    requestId: String(propose.body.requestId),
    person: 'Dana Reyes',
    authenticator: reg.authenticator,
  })
  expect(bad.status).toBe(403)

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) => e.action === 'review.approve' && /authenticator not allowed/i.test(e.outcome),
    ),
  ).toBe(true)
  expect(audit.entries.some((e) => /Mandate issued/i.test(e.outcome))).toBe(false)
})

test('KEY-11 Cloned key signature counter refuses; audit records clone', async ({ page }) => {
  await page.goto('/profile')
  const reg = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'CloneProbe YubiKey',
  })
  expect(reg.status).toBe(200)

  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const first = await approveReviewViaCdp({
    page,
    requestId: String(propose.body.requestId),
    person: 'Dana Reyes',
    authenticator: reg.authenticator,
  })
  expect(first.status).toBe(200)

  // Arrange: server counter advances ahead of this authenticator (stale/clone).
  await control({
    inflateSignatureCounter: { person: 'Dana Reyes', label: 'CloneProbe YubiKey', to: 50 },
  })

  const propose2 = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND, annualValue: 53000 },
  })
  const clone = await approveReviewViaCdp({
    page,
    requestId: String(propose2.body.requestId),
    person: 'Dana Reyes',
    authenticator: reg.authenticator,
  })
  expect(clone.status).toBe(403)

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'security_key.clone')).toBe(true)
})

test('KEY-12 Approval payload replay rejected — no second mandate', async ({ page }) => {
  await page.goto('/profile')
  const reg = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'device-bound',
    label: 'ReplayProbe Key',
  })
  expect(reg.status).toBe(200)

  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const first = await approveReviewViaCdp({
    page,
    requestId: String(propose.body.requestId),
    person: 'Dana Reyes',
    authenticator: reg.authenticator,
  })
  expect(first.status).toBe(200)
  expect(first.body.mandateId).toBeTruthy()
  expect(first.assertion).toBeTruthy()

  const propose2 = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND, annualValue: 54000 },
  })
  const replay = await approveReviewViaCdp({
    page,
    requestId: String(propose2.body.requestId),
    person: 'Dana Reyes',
    authenticator: reg.authenticator,
    replayAssertion: first.assertion,
  })
  expect(replay.status).toBe(403)
  expect(String(replay.body.error)).toMatch(/replay/i)

  const audit = await getAudit()
  expect(audit.entries.some((e) => /Replay rejected/i.test(e.outcome))).toBe(true)
})
