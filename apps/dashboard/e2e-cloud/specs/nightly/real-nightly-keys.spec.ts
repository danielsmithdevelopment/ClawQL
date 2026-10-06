/**
 * Real Nightly E2E — honest witnesses via public /api/e2e surfaces + webhook :4091 + UI.
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
  getWitness,
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

const NORTHWIND = { contract: 'northwind', annualValue: 52000 } as const
const PII = 'Contact jane.okafor@example.com or call 415-555-0199. Bank 123456789012345.'

test.beforeEach(async () => {
  await resetWorld()
})

test('KEY-02 Register synced passkey shows Sign-in only', async ({ page }) => {
  const reg = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'synced', name: 'iCloud passkey' })
  expect(reg.status).toBe(200)
  expect(reg.body.status).toBe('Sign-in only')
  await page.goto('/profile')
  await expect(page.getByText(/Sign-in only/i).first()).toBeVisible()
})

test('KEY-03 Marcus needs 2; Remind notifies', async () => {
  const remind = await keysApi({ action: 'remind', person: 'Marcus Lee' })
  expect(remind.status).toBe(200)
  expect(remind.body.row).toBe('needs 2')
  expect(remind.body.notified).toBe(true)
  const wit = await getWitness()
  const marcus = (wit.body.people as { name: string; needsTwo: boolean; keyCount: number }[]).find(
    (p) => p.name === 'Marcus Lee',
  )
  expect(marcus?.needsTwo).toBe(true)
  const outbox = wit.body.notificationsOutbox as { to: string; body: string }[]
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
  const wit0 = await getWitness()
  const remaining0 = Number((wit0.body.org as { recoveryCodesRemaining: number }).recoveryCodesRemaining)
  // Get a code via register response or control use
  const codesRes = await control({ registerSecurityKeys: { person: 'Dana Reyes', count: 2 } })
  expect(codesRes.status).toBe(200)
  // Fetch codes from keys register
  const reg = await keysApi({ action: 'register', person: 'Marcus Lee', keyKind: 'device-bound', name: 'M2' })
  const codes = (reg.body.recoveryCodes as string[] | undefined) ?? []
  // Use org recovery via control — seed codes still on world
  const w = await getWitness()
  // Use first recovery via control
  const use1 = await control({ useRecoveryCode: 'REC-PLACEHOLDER' })
  // Get real code by regenerating then... better: useRecoveryCode with actual from seed — not exposed.
  // Issue: recovery codes not on GET. Use register which returns them when shown once.
  await resetWorld()
  await control({ securityKeysRegistered: false, markFirstRun: 1 })
  const r1 = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'device-bound', name: 'A' })
  const r2 = await keysApi({ action: 'register', person: 'Dana Reyes', keyKind: 'device-bound', name: 'B' })
  const recovery = (r2.body.recoveryCodes as string[]) ?? (r1.body.recoveryCodes as string[]) ?? []
  expect(recovery.length).toBeGreaterThan(0)
  const code = recovery[0]!
  const before = recovery.length
  const ok = await control({ useRecoveryCode: code })
  expect(ok.status).toBe(200)
  const afterWit = await getWitness()
  expect(Number((afterWit.body.org as { recoveryCodesRemaining: number }).recoveryCodesRemaining)).toBe(before - 1)
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

test('KEY-07 Issue without user verification creates no key', async () => {
  await control({ registerSecurityKeys: { person: 'Dana Reyes', count: 2 } })
  const before = ((await keysApi()).body.keys as unknown[]).length
  const issued = await keysApi({
    action: 'issue',
    name: 'no-uv-key',
    pinVerified: false,
    userVerification: false,
  })
  expect(issued.status).toBe(403)
  const after = ((await keysApi()).body.keys as unknown[]).length
  expect(after).toBe(before)
})

test('KEY-08 Cancel step-up at key prompt — nothing changes', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const cancel = await approveReview({ requestId, actor: 'Dana Reyes', cancel: true })
  expect(cancel.status).toBe(200)
  expect(cancel.body.cancelled).toBe(true)
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(48500)
  const review = await listReview()
  const item = (review.body.review as { id: string; status: string }[]).find((r) => r.id === requestId)
  expect(item?.status).toBe('waiting')
  const audit = await getAudit()
  expect(audit.entries.some((e) => /Cancelled at key prompt/i.test(e.outcome))).toBe(true)
  expect(audit.entries.some((e) => e.action === 'review.approve' && /Mandate issued/i.test(e.outcome))).toBe(false)
})

test('KEY-09 Org delete without fresh sign-in asks to sign in again', async () => {
  const del = await control({ deleteOrg: { name: 'Acme Robotics', pinVerified: true, freshSignIn: false } })
  expect(del.status).toBe(401)
  expect(String(del.body.error)).toMatch(/sign in again/i)
})

test('KEY-10 Approval with disallowed AAGUID refused; still waiting', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const bad = await approveReview({
    requestId,
    actor: 'Dana Reyes',
    keyKind: 'device-bound',
    pinVerified: true,
    aaguid: 'aagu_evil_clone',
  })
  expect(bad.status).toBe(403)
  const review = await listReview()
  const item = (review.body.review as { id: string; status: string }[]).find((r) => r.id === requestId)
  expect(item?.status).toBe('waiting')
})

test('KEY-11 Cloned key signature counter refuses; audit records clone', async () => {
  await control({ resetSignatureCounter: { person: 'Dana Reyes' } })
  // After reset counter is 0; approving with counter < stored... reset sets to 0, then approve with 0 when expected was raised?
  // Route: if signatureCounter < sk.signatureCounter → clone. Reset to 0, then approve with 0 when sk is 0 — equal ok.
  // Set counter high then approve with lower:
  const wit = await getWitness()
  const dana = (wit.body.people as { name: string; keys: { signatureCounter: number }[] }[]).find(
    (p) => p.name === 'Dana Reyes',
  )
  const current = dana?.keys[0]?.signatureCounter ?? 1
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  // Bump counter via successful approve first with high, then try lower — use control reset after bump
  await approveReview({
    requestId: String(propose.body.requestId),
    actor: 'Dana Reyes',
    pinVerified: true,
    signatureCounter: current + 5,
  })
  // New request for clone attempt
  const propose2 = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND, annualValue: 53000 },
  })
  const clone = await approveReview({
    requestId: String(propose2.body.requestId),
    actor: 'Dana Reyes',
    pinVerified: true,
    signatureCounter: current + 1, // lower than stored current+5
  })
  expect(clone.status).toBe(403)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'security_key.clone')).toBe(true)
})

test('KEY-12 Approval payload replay rejected — no second mandate', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const payload = `signed-once-${requestId}`
  const first = await approveReview({
    requestId,
    actor: 'Dana Reyes',
    pinVerified: true,
    signedPayload: payload,
  })
  expect(first.status).toBe(200)
  expect(first.body.mandateId).toBeTruthy()
  // Second request with same signed payload
  const propose2 = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND, annualValue: 54000 },
  })
  const replay = await approveReview({
    requestId: String(propose2.body.requestId),
    actor: 'Dana Reyes',
    pinVerified: true,
    signedPayload: payload,
  })
  expect(replay.status).toBe(403)
  expect(String(replay.body.error)).toMatch(/replay/i)
})
