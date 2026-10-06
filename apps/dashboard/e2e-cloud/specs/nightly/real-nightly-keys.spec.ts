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
  const remind = await keysApi({ action: 'remind', person: 'Marcus Lee' })
  expect(remind.status).toBe(200)
  expect(remind.body.row).toBe('needs 2')
  expect(remind.body.notified).toBe(true)
  const listed = await keysApi()
  const marcus = (listed.body.people as { name: string; needsTwo: boolean; keyCount: number }[]).find(
    (p) => p.name === 'Marcus Lee',
  )
  expect(marcus?.needsTwo).toBe(true)
  const settings = await getSettings()
  const outbox = settings.body.notificationsOutbox ?? []
  expect(outbox.some((n) => n.to === 'Marcus Lee' && /needs 2/i.test(n.body))).toBe(true)
})

test('KEY-04 Cannot remove key below two-key rule', async () => {
  const listed = await keysApi()
  const dana = (listed.body.people as { name: string; keys: { id: string }[] }[]).find((p) => p.name === 'Dana Reyes')
  const remove = await keysApi({ action: 'remove', person: 'Dana Reyes', keyId: dana?.keys[0]?.id })
  expect(remove.status).toBe(403)
  expect(String(remove.body.error ?? remove.body.explanation)).toMatch(/two-key/i)
})

test('KEY-05 Recovery code once then reuse rejected', async () => {
  const remaining0 = Number((await keysApi()).body.recoveryCodesRemaining)
  expect(remaining0).toBeGreaterThan(0)
  await resetWorld()
  await control({ securityKeysRegistered: false, markFirstRun: 1 })
  const r1 = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'device-bound', name: 'A' })
  const r2 = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'device-bound', name: 'B' })
  const recovery = (r2.body.recoveryCodes as string[]) ?? (r1.body.recoveryCodes as string[]) ?? []
  expect(recovery.length).toBeGreaterThan(0)
  const code = recovery[0]!
  const before = Number((await keysApi()).body.recoveryCodesRemaining)
  const ok = await control({ useRecoveryCode: code })
  expect(ok.status).toBe(200)
  expect(Number((await keysApi()).body.recoveryCodesRemaining)).toBe(before - 1)
  const reuse = await control({ useRecoveryCode: code })
  expect(reuse.status).toBe(403)
})

test('KEY-06 Regenerated recovery codes reject old code', async () => {
  await control({ securityKeysRegistered: false, markFirstRun: 1 })
  const r1 = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'device-bound', name: 'A' })
  const r2 = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'device-bound', name: 'B' })
  const old = ((r2.body.recoveryCodes as string[]) ?? (r1.body.recoveryCodes as string[]) ?? [])[0]!
  const regen = await control({ regenerateRecoveryCodes: true })
  expect(regen.status).toBe(200)
  const reuse = await control({ useRecoveryCode: old })
  expect(reuse.status).toBe(403)
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

test('KEY-09 Org delete without fresh sign-in asks to sign in again', async () => {
  const del = await control({ deleteOrg: { name: 'Acme Robotics', pinVerified: true, freshSignIn: false } })
  expect(del.status).toBe(401)
  expect(String(del.body.error)).toMatch(/sign in again/i)
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
