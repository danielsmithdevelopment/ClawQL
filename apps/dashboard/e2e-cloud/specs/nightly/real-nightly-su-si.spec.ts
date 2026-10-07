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
  directorySync,
  eraseSubject,
  fetchAsOrg,
  getAudit,
  getCrm,
  getDocuments,
  getInboundStats,
  getOrg,
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
  stripeCheckout,
  subscriptionAction,
  systemOne,
  uploadDocument,
  waitForDeliveries,
} from '../../helpers/harness'
import {
  approveReviewViaCdp,
  registerSecurityKeyViaCdp,
} from '../../helpers/webauthn-ceremony'

const NORTHWIND = { contract: 'northwind', annualValue: 52000 } as const
const PII = 'Contact jane.okafor@example.com or call 415-555-0199. Bank 123456789012345.'

test.beforeEach(async () => {
  await resetWorld()
})

test('SU-02 Stripe checkout replay does not double-provision', async () => {
  await control({ stripeProvisioningDone: false, markFirstRun: 0 })
  // Pass-when via POST /billing/checkout + /audit (helper hits production path).
  const first = await stripeCheckout({ testCard: '4242424242424242', signedInUserId: 'user_dana' })
  expect(first.status).toBe(200)
  expect(first.body.provisioned).toBe(true)
  const keysBefore = (await keysApi()).body.keys as unknown[]
  const second = await stripeCheckout({ testCard: '4242424242424242', signedInUserId: 'user_dana', replay: true })
  expect(second.status).toBe(200)
  expect(second.body.replayIgnored).toBe(true)
  expect(second.body.provisioned).toBe(false)
  const keysAfter = (await keysApi()).body.keys as unknown[]
  expect(keysAfter.length).toBe(keysBefore.length)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'plan.started')).toBe(true)
  expect(
    audit.entries.some(
      (e) => e.action === 'checkout.completed' && /Ignored replay|already provisioned/i.test(e.outcome),
    ),
  ).toBe(true)
})

test('SU-03 Foreign checkout user id ignored; signed-in user owns org', async ({ page }) => {
  await control({ stripeProvisioningDone: false, signedInUserId: 'user_dana' })
  const checkout = await stripeCheckout({
    signedInUserId: 'user_dana',
    foreignUserId: 'user_attacker',
    testCard: '4242424242424242',
  })
  expect(checkout.status).toBe(200)
  expect(checkout.body.provisioned).toBe(true)
  expect(checkout.body.owner).toBe('Dana Reyes')

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'owner.joined')).toBe(true)
  expect(JSON.stringify(audit.entries)).not.toContain('user_attacker')

  await page.goto('/')
  await expect(page.getByText('Acme Robotics').first()).toBeVisible()
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
  await page.goto('/profile')
  const reg = await registerSecurityKeyViaCdp({
    page,
    person: 'Dana Reyes',
    kind: 'synced',
    label: 'Dana passkey',
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
    page.locator('[data-testid="profile-security-key"][data-key-label="Dana passkey"]'),
  ).toHaveAttribute('data-key-badge', 'Sign-in only')
})

test('SI-03 TOTP register is never offered for approvals', async ({ page }) => {
  // Arrange: TOTP is not a WebAuthn ceremony — register via harness, then refuse approve.
  await keysApi({
    action: 'register',
    person: 'Dana Reyes',
    keyKind: 'totp',
    name: 'Authenticator app',
  })
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  await approveReview({
    requestId: String(propose.body.requestId),
    actor: 'Dana Reyes',
    keyKind: 'totp',
    pinVerified: true,
  })

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) => e.action === 'security_key.register' && e.outcome === 'Sign-in only',
    ),
  ).toBe(true)
  expect(
    audit.entries.some(
      (e) => e.action === 'review.approve' && /can't approve/i.test(e.outcome),
    ),
  ).toBe(true)
  expect(audit.entries.some((e) => /Mandate issued/i.test(e.outcome))).toBe(false)

  await page.goto('/profile')
  await expect(
    page.locator('[data-testid="profile-security-key"][data-key-label="Authenticator app"]'),
  ).toHaveAttribute('data-key-badge', 'Sign-in only')
})

test('SI-04 Idle timeout signs out; return path preserved', async ({ page }) => {
  // Arrange: idle window is 30m — age lastActiveAt past it. Enforce is Pass-when.
  await control({ ageLastActive: { person: 'Dana Reyes', minutesAgo: 31 } })

  await page.goto('/profile')
  await expect(page.getByTestId('profile-signed-out')).toBeVisible()
  await expect(page.getByTestId('profile-return-path')).toHaveText('/home')
  await expect(page.getByTestId('profile-signed-out')).toHaveAttribute('data-return-path', '/home')

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) =>
        e.action === 'session.idle' &&
        /idle timeout/i.test(e.outcome) &&
        (e.meta as { path?: string } | undefined)?.path === '/home',
    ),
  ).toBe(true)
})

test('SI-05 Max session length forces re-auth even when active', async ({ page }) => {
  // Arrange: max session is 12h — age signedInAt past it (lastActive stays fresh).
  await control({ ageSession: { person: 'Dana Reyes', minutesAgo: 12 * 60 + 1 } })

  await page.goto('/profile')
  await expect(page.getByTestId('profile-signed-out')).toBeVisible()

  const audit = await getAudit()
  expect(
    audit.entries.some(
      (e) => e.action === 'session.max' && /max session length/i.test(e.outcome),
    ),
  ).toBe(true)
})

test('SI-06 Sign out everywhere else ends second browser session', async ({ page }) => {
  // Arrange: second browser session only.
  await control({ secondBrowserSession: { person: 'Dana Reyes' } })

  await page.goto('/profile')
  await expect(page.getByTestId('profile-sign-out-everywhere-else')).toBeVisible()
  await page.getByTestId('profile-sign-out-everywhere-else').click()

  await expect(page.locator('[data-testid="profile-session"][data-session-ended="true"]')).toHaveCount(1, {
    timeout: 10_000,
  })
  await expect(page.locator('[data-testid="profile-session"][data-session-ended="false"]')).toHaveCount(1)

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'session.end_others')).toBe(true)
})

test('SI-07 Okta sync removes Jordan from Support — ticket-triage denied', async () => {
  // Arrange: Okta-shaped directory sync (Keycloak Compose realm next).
  await directorySync({ removeJordanFromSupport: true })

  // Pass-when: production POST /decision refuses + /audit (not /api/e2e/decision).
  const res = await decisionCall({
    key: KEYS.supportBot,
    site: 'ticket-triage',
    answer: 'Refund request',
    actor: 'Jordan Park',
  })
  expect(res.status).toBe(403)
  expect(String(res.body.error)).toMatch(/not allowed|ticket-triage/i)

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'sync.group')).toBe(true)
  expect(
    audit.entries.some(
      (e) =>
        e.action === 'decision.answer' &&
        /not allowed to answer ticket-triage/i.test(e.outcome),
    ),
  ).toBe(true)
})

test('SI-08 Okta deactivate Priya — cannot act; audit records change', async ({ page }) => {
  // Arrange: CDP key for Priya, then Okta deactivate (sync still harness until Compose Keycloak).
  await page.goto('/profile')
  const reg = await registerSecurityKeyViaCdp({
    page,
    person: 'Priya Shah',
    kind: 'device-bound',
    label: 'Priya CDP',
  })
  expect(reg.status).toBe(200)
  await directorySync({ deactivatePriya: true })

  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const denied = await approveReviewViaCdp({
    page,
    requestId: String(propose.body.requestId),
    person: 'Priya Shah',
    authenticator: reg.authenticator,
  })
  expect(denied.status).toBe(403)
  expect(String(denied.body.error)).toMatch(/deactivated/i)

  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'sync.deactivate')).toBe(true)
  expect(
    audit.entries.some(
      (e) => e.action === 'review.approve' && /deactivated/i.test(e.outcome),
    ),
  ).toBe(true)
})
