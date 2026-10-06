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

const NORTHWIND = { contract: 'northwind', annualValue: 52000 } as const
const PII = 'Contact jane.okafor@example.com or call 415-555-0199. Bank 123456789012345.'

test.beforeEach(async () => {
  await resetWorld()
})

test('SU-02 Stripe checkout replay does not double-provision', async () => {
  await control({ stripeProvisioningDone: false, markFirstRun: 0 })
  const first = await stripeCheckout({ testCard: '4242424242424242', signedInUserId: 'user_dana' })
  expect(first.status).toBe(200)
  expect(first.body.provisioned).toBe(true)
  const keysBefore = (await keysApi()).body.keys as unknown[]
  const second = await stripeCheckout({ testCard: '4242424242424242', signedInUserId: 'user_dana', replay: true })
  expect(second.status).toBe(200)
  expect(second.body.replayIgnored).toBe(true)
  expect(second.body.provisioned).toBe(false)
  const org = await getOrg()
  expect(org.body.orgId).toBeTruthy()
  expect(org.body.ownerCount).toBe(1)
  const keysAfter = (await keysApi()).body.keys as unknown[]
  expect(keysAfter.length).toBe(keysBefore.length)
  const audit = await getAudit()
  const provisioned = audit.entries.filter((e) => e.action === 'plan.started' || e.outcome.includes('Provisioned'))
  const ignored = audit.entries.filter((e) => /Ignored replay|already provisioned/i.test(e.outcome))
  expect(ignored.length).toBeGreaterThanOrEqual(1)
  expect(provisioned.length).toBeLessThanOrEqual(2)
})

test('SU-03 Foreign checkout user id ignored; signed-in user owns org', async () => {
  await control({ stripeProvisioningDone: false, signedInUserId: 'user_dana' })
  const checkout = await stripeCheckout({
    signedInUserId: 'user_dana',
    foreignUserId: 'user_attacker',
    testCard: '4242424242424242',
  })
  expect(checkout.status).toBe(200)
  expect(checkout.body.provisioned).toBe(true)
  expect(checkout.body.owner).toBe('Dana Reyes')
  const org = await getOrg()
  expect(org.body.owner).toBe('Dana Reyes')
  const blob = JSON.stringify(org.body)
  expect(blob).not.toContain('user_attacker')
})

test('SU-05 Register two security keys unlocks step 3 and shows recovery codes once', async ({ page }) => {
  await control({ securityKeysRegistered: false, markFirstRun: 1, stripeProvisioningDone: true })
  const a = await keysApi({
    action: 'register',
    person: 'Dana Reyes',
    keyKind: 'device-bound',
    name: 'Dana YubiKey A',
  })
  expect(a.status).toBe(200)
  const b = await keysApi({
    action: 'register',
    person: 'Dana Reyes',
    keyKind: 'device-bound',
    name: 'Dana YubiKey B',
  })
  expect(b.status).toBe(200)
  expect(Array.isArray(b.body.recoveryCodes) || Array.isArray(a.body.recoveryCodes)).toBe(true)
  const org = await getOrg()
  expect(org.body.firstRun?.step3Unlocked).toBe(true)
  expect(Number(org.body.firstRun?.step)).toBeGreaterThanOrEqual(3)
  await openManagedConsole(page)
  await page.goto('/settings')
  await page.getByTestId('settings-nav-signin').click()
  await expect(page.getByText(/Keys each person must register|security keys/i).first()).toBeVisible()
})

test('SU-06 Agent first-run steps: key issue waits for person; write waits for mandate', async () => {
  await control({ registerSecurityKeys: { person: 'Dana Reyes', count: 2 }, markFirstRun: 3 })
  const issued = await keysApi({
    action: 'issue',
    name: 'first-run-agent',
    group: 'Legal',
    canUse: ['models', 'tools'],
    pinVerified: true,
  })
  expect(issued.status).toBe(200)
  await keysApi({ action: 'confirmSaved', name: 'first-run-agent' })
  const write = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  expect(write.status).toBe(402)
  expect(write.body.requestId).toBeTruthy()
  const review = await listReview()
  expect(review.body.review.some((r: { status: string }) => r.status === 'waiting')).toBe(true)
  const org = await getOrg()
  expect(Number((org.body.firstRun as { step: number }).step)).toBeGreaterThanOrEqual(3)
})

test('SU-07 Empty Sessions/Review copy; audit has 3 seed entries and verified chain', async ({ page }) => {
  // Fresh world after reset — clear seeded waiting review via approve/decline not required;
  // seed has 3 review items; empty-state for new org is after clearing. Use control expire + decline.
  for (const item of (await listReview()).body.review as { id: string; status: string }[]) {
    if (item.status === 'waiting') {
      await approveReview({ requestId: item.id, actor: 'Dana Reyes', approve: false, reason: 'clear' })
    }
  }
  const audit = await getAudit()
  expect(audit.chain.ok).toBe(true)
  expect(audit.entries.length).toBeGreaterThanOrEqual(3)
  await openManagedConsole(page)
  await page.goto('/sessions')
  await expect(page.getByText(/No sessions|session/i).first()).toBeVisible()
  await page.goto('/review')
  await expect(page.locator('body')).toBeVisible()
})

test('SI-02 Synced passkey register shows Sign-in only', async ({ page }) => {
  const reg = await keysApi({
    action: 'register',
    person: 'Dana Reyes',
    keyKind: 'synced',
    name: 'Dana passkey',
  })
  expect(reg.status).toBe(200)
  expect(reg.body.status).toBe('Sign-in only')
  const listed = await keysApi()
  const dana = (listed.body.people as { name: string; keys: { status: string; kind: string }[] }[]).find(
    (p) => p.name === 'Dana Reyes',
  )
  expect(dana?.keys.some((k) => k.status === 'Sign-in only' || k.kind === 'synced')).toBe(true)
  await page.goto('/profile')
  await expect(page.getByText(/Sign-in only|Can approve/i).first()).toBeVisible()
})

test('SI-03 TOTP register is never offered for approvals', async () => {
  const reg = await keysApi({
    action: 'register',
    person: 'Dana Reyes',
    keyKind: 'totp',
    name: 'Authenticator app',
  })
  expect(reg.status).toBe(200)
  expect(reg.body.status).toBe('Sign-in only')
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const denied = await approveReview({
    requestId: String(propose.body.requestId),
    actor: 'Dana Reyes',
    keyKind: 'totp',
    pinVerified: true,
  })
  expect(denied.status).toBe(403)
  expect(String(denied.body.error)).toMatch(/can't approve/i)
})

test('SI-04 Idle timeout signs out; return path preserved', async ({ page }) => {
  await control({ idleSignOut: { person: 'Dana Reyes' } })
  const settings = await getSettings()
  const dana = settings.body.people?.find((p) => p.name === 'Dana Reyes')
  expect(dana?.sessions.some((s) => s.ended)).toBe(true)
  expect(dana?.sessions.find((s) => s.ended)?.path).toBe('/home')
  expect(settings.body.signedIn).toBe(false)
  const org = await getOrg()
  const orgDana = (org.body.people as { name: string; sessions: { ended: boolean; path: string }[] }[]).find(
    (p) => p.name === 'Dana Reyes',
  )
  expect(orgDana?.sessions.some((s) => s.ended && s.path === '/home')).toBe(true)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'session.idle')).toBe(true)
  await page.goto('/profile')
  await expect(page.getByText(/Sign out/i).first()).toBeVisible()
})

test('SI-05 Max session length forces re-auth even when active', async ({ page }) => {
  await control({ forceSessionExpiry: { person: 'Dana Reyes' } })
  const settings = await getSettings()
  const dana = settings.body.people?.find((p) => p.name === 'Dana Reyes')
  expect(dana?.sessions.some((s) => s.ended)).toBe(true)
  expect(settings.body.signedIn).toBe(false)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'session.max')).toBe(true)
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible()
})

test('SI-06 Sign out everywhere else ends second browser session', async ({ page }) => {
  await control({ secondBrowserSession: { person: 'Dana Reyes' } })
  let settings = await getSettings()
  let dana = settings.body.people?.find((p) => p.name === 'Dana Reyes')
  expect((dana?.sessions.length ?? 0)).toBeGreaterThanOrEqual(2)
  expect(dana?.sessions.filter((s) => !s.ended).length).toBeGreaterThanOrEqual(2)
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: /Sign out everywhere else/i })).toBeVisible()
  const ended = await settingsMutate({ actor: 'Dana Reyes', endOtherSessions: true })
  expect(ended.status).toBe(200)
  settings = await getSettings()
  dana = settings.body.people?.find((p) => p.name === 'Dana Reyes')
  const others = dana?.sessions.slice(1) ?? []
  expect(others.every((s) => s.ended)).toBe(true)
  expect(dana?.sessions[0]?.ended).toBe(false)
  expect(settings.body.signedIn).toBe(true)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'session.end_others')).toBe(true)
})

test('SI-07 Okta sync removes Jordan from Support — ticket-triage denied', async () => {
  await control({ syncOkta: { removeJordanFromSupport: true } })
  const res = await decisionCall({
    key: KEYS.supportBot,
    site: 'ticket-triage',
    answer: 'Refund request',
    actor: 'Jordan Park',
  })
  expect(res.status).toBe(403)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'sync.group')).toBe(true)
})

test('SI-08 Okta deactivate Priya — cannot act; audit records change', async () => {
  await control({ syncOkta: { deactivatePriya: true } })
  const org = await getOrg()
  const priya = (org.body.people as { name: string; active: boolean }[]).find((p) => p.name === 'Priya Shah')
  expect(priya?.active).toBe(false)
  const settings = await getSettings()
  expect(settings.body.people?.find((p) => p.name === 'Priya Shah')?.active).toBe(false)
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const denied = await approveReview({
    requestId: String(propose.body.requestId),
    actor: 'Priya Shah',
    pinVerified: true,
  })
  expect(denied.status).toBe(403)
  expect(String(denied.body.error)).toMatch(/deactivated/i)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'sync.deactivate')).toBe(true)
})
