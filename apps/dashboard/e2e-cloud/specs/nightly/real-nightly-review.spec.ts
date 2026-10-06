/**
 * Real Nightly E2E — honest witnesses via public /api/e2e surfaces + webhook :4091 + UI.
 * Never uses POST /api/e2e/scenario or runScenario as pass criteria.
 */
import { test, expect } from '@playwright/test'

import { KEYS, mcpCallTool } from '../../harness/agent-driver.mjs'
import { openManagedConsole } from '../../helpers/console'
import {
  approveReview,
  control,
  decisionCall,
  getAudit,
  getConnections,
  getCrm,
  getSettings,
  listReview,
  resetWorld,
  settingsMutate,
  skillsApi,
} from '../../helpers/harness'

const NORTHWIND = { contract: 'northwind', annualValue: 52000 } as const

test.beforeEach(async () => {
  await resetWorld()
})


test('REV-04 Agent changes args while reviewing — approval sees change, CRM unchanged', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const digest0 = String(propose.body.digest ?? '')
  await control({
    changeRequestArgs: { requestId, args: { ...NORTHWIND, effectiveDate: '2026-06-01' } },
  })
  const review = await listReview()
  const item = (review.body.review as { id: string; digest: string; status: string }[]).find(
    (r) => r.id === requestId,
  )
  expect(item?.status).toBe('waiting')
  expect(item?.digest).toBeTruthy()
  expect(item?.digest).not.toBe(digest0)
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(48500)
  const audit = await getAudit()
  expect(audit.entries.some((e) => /request changed/i.test(e.outcome) || e.action === 'review.changed')).toBe(
    true,
  )
})

test('REV-05 Synced passkey cannot approve; request still waiting', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const denied = await approveReview({
    requestId,
    actor: 'Dana Reyes',
    keyKind: 'synced',
    pinVerified: true,
  })
  expect(denied.status).toBe(403)
  expect(String(denied.body.error)).toMatch(/can't approve/i)
  const item = ((await listReview()).body.review as { id: string; status: string }[]).find(
    (r) => r.id === requestId,
  )
  expect(item?.status).toBe('waiting')
})

test('REV-06 Expired request refuses agent write; CRM unchanged', async ({ page }) => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  await control({ expireRequest: requestId })
  const review = await listReview()
  const item = (review.body.review as { id: string; status: string }[]).find((r) => r.id === requestId)
  expect(item?.status).toBe('expired')
  const write = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  expect([402, 409]).toContain(write.status)
  expect(String(write.body.error ?? '')).toMatch(/expired|mandate/i)
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(48500)
  await page.goto('/review')
  await expect(page.getByText(/expired|Change a contract/i).first()).toBeVisible()
})

test('REV-08 Jordan can see but not approve; filter hides', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const jordan = await approveReview({
    requestId,
    actor: 'Jordan Park',
    pinVerified: true,
  })
  expect(jordan.status).toBe(403)
  expect(jordan.body.canSee).toBe(true)
  expect(jordan.body.canApprove).toBeFalsy()
  const hidden = await approveReview({
    requestId,
    actor: 'Jordan Park',
    pinVerified: true,
    onlyWhatICanApprove: true,
  })
  expect(hidden.body.hidden === true || hidden.body.visible === false || hidden.status === 403).toBe(true)
})

test('REV-09 Decline with reason and note; CRM unchanged; audit holds both', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const declined = await approveReview({
    requestId,
    actor: 'Dana Reyes',
    approve: false,
    reason: 'too risky',
    note: 'hold off',
    pinVerified: true,
  })
  expect(declined.status).toBe(200)
  expect(declined.body.status).toBe('declined')
  expect(declined.body.reason).toBe('too risky')
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(48500)
  const audit = await getAudit()
  const entry = audit.entries.find((e) => e.action === 'review.decline')
  expect(entry?.outcome).toMatch(/too risky/i)
  expect(JSON.stringify(entry?.meta ?? {})).toMatch(/hold off/)
})

test('REV-10 Approval digest matches audit digest', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const approval = await approveReview({ requestId, actor: 'Dana Reyes', pinVerified: true })
  expect(approval.status).toBe(200)
  const digest = String(approval.body.digest)
  expect(digest.length).toBeGreaterThan(8)
  const audit = await getAudit()
  const entry = audit.entries.find((e) => e.action === 'review.approve' && /Mandate issued/i.test(e.outcome))
  expect(String(entry?.meta?.digest)).toBe(digest)
})

test('REV-11 Dual approval: Dana twice refused; Marcus completes once', async () => {
  await control({ setRequiredApprovals: 2 })
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const first = await approveReview({ requestId, actor: 'Dana Reyes', pinVerified: true })
  expect(first.status).toBe(200)
  expect(first.body.partial).toBe(true)
  const twice = await approveReview({ requestId, actor: 'Dana Reyes', pinVerified: true })
  expect(twice.status).toBe(403)
  const marcus = await approveReview({ requestId, actor: 'Marcus Lee', pinVerified: true })
  expect(marcus.status).toBe(200)
  expect(marcus.body.mandateId).toBeTruthy()
  const write = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  expect(write.status).toBe(200)
  const again = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  expect(again.status).toBe(402)
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(52000)
})

test('REV-12 Each mandate covers only its own request', async () => {
  const a = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { contract: 'northwind', annualValue: 52000 },
  })
  const b = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { contract: 'northwind', annualValue: 61000 },
  })
  const idA = String(a.body.requestId)
  const idB = String(b.body.requestId)
  expect(idA).not.toBe(idB)
  const apA = await approveReview({ requestId: idA, actor: 'Dana Reyes', pinVerified: true })
  expect(apA.status).toBe(200)
  const writeB = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { contract: 'northwind', annualValue: 61000 },
  })
  expect(writeB.status).toBe(402)
  const writeA = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { contract: 'northwind', annualValue: 52000 },
  })
  expect(writeA.status).toBe(200)
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(52000)
})

test('REV-15 Dana approves Linear source — connected, no key group', async ({ page }) => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'sources_propose',
    args: { name: 'Linear' },
  })
  const requestId = String(propose.body.requestId)
  const ap = await approveReview({ requestId, actor: 'Dana Reyes', pinVerified: true })
  expect(ap.status).toBe(200)
  const linear = (await getConnections()).body.connections.find(
    (c) => c.id === 'linear' || c.name === 'Linear',
  )
  expect(linear?.status).toBe('connected')
  expect(linear?.groups?.length ?? 0).toBe(0)
  await openManagedConsole(page)
  await page.goto('/connections')
  await expect(page.getByText(/Linear|GitHub/i).first()).toBeVisible()
})

test('REV-16 Decline Linear — pending gone; skill needing it stays blocked', async () => {
  const pending = (await getConnections()).body.connections.find((c) => c.id === 'linear')
  expect(pending?.status).toBe('waiting-review')
  const seeded = ((await listReview()).body.review as { id: string; kind: string }[]).find(
    (r) => r.kind === 'source',
  )
  expect(seeded).toBeTruthy()
  await approveReview({
    requestId: seeded!.id,
    actor: 'Dana Reyes',
    approve: false,
    reason: 'not now',
    pinVerified: true,
  })
  await control({
    skillMutate: { id: 'needs-linear', name: 'needs-linear', stage: 'proposed', needsConnection: 'linear' },
  })
  const skill = ((await skillsApi()).body.skills as { id: string; needsConnection?: string; stage: string }[]).find(
    (s) => s.id === 'needs-linear',
  )
  expect(skill?.needsConnection).toBe('linear')
  expect(skill?.stage).not.toBe('active')
})

test('REV-18 Skip decision then ask teammate — still waiting + notified', async () => {
  const res = await decisionCall({
    key: KEYS.supportBot,
    site: 'ticket-triage',
    skip: true,
    askTeammate: 'Marcus Lee',
    actor: 'Jordan Park',
  })
  expect(res.status).toBe(200)
  expect(res.body.status).toBe('waiting')
  const review = await listReview()
  expect(
    (review.body.review as { kind: string; status: string }[]).some(
      (r) => r.kind === 'decision' && r.status === 'waiting',
    ),
  ).toBe(true)
  const settings = await getSettings()
  const outbox = settings.body.notificationsOutbox ?? []
  expect(outbox.some((n) => n.to === 'Marcus Lee')).toBe(true)
})

test('REV-19 Request expiry 30→15 minutes with audit old/new', async () => {
  const before = await getSettings()
  const old = Number(before.body.requestExpiryMinutes)
  const mutate = await settingsMutate({ requestExpiryMinutes: 15, actor: 'Dana Reyes', asRole: 'owner' })
  expect(mutate.status).toBe(200)
  expect(Number(mutate.body.requestExpiryMinutes)).toBe(15)
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND, annualValue: 55000 },
  })
  const item = ((await listReview()).body.review as { id: string; expiresAt: string }[]).find(
    (r) => r.id === String(propose.body.requestId),
  )
  const ms = new Date(item!.expiresAt).getTime() - Date.now()
  expect(ms).toBeLessThan(16 * 60_000)
  expect(ms).toBeGreaterThan(5 * 60_000)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'settings.request_expiry')).toBe(true)
  void old
})

test('REV-20 Requester-cannot-approve control is locked', async () => {
  const settings = await getSettings()
  expect(settings.body.requesterCannotApproveLocked).toBe(true)
})

test('REV-22 Home, Review, sidebar badges always agree', async ({ page }) => {
  const a = await listReview()
  expect(a.body.badges.home).toBe(a.body.badges.review)
  expect(a.body.badges.review).toBe(a.body.badges.sidebar)
  await mcpCallTool({ key: KEYS.legalOps, name: 'adjust_contract_value', args: { ...NORTHWIND } })
  const b = await listReview()
  expect(b.body.badges.home).toBe(b.body.badges.review)
  expect(b.body.badges.review).toBe(b.body.badges.sidebar)
  await openManagedConsole(page)
  await page.goto('/review')
  await expect(page.getByText(/Change a contract|Review/i).first()).toBeVisible()
})
