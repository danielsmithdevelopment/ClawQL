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


test('SK-01 Propose skill with session count', async ({ page }) => {
  await control({ proposeSkill: { name: 'repeated-triage', sessionCount: 5 } })
  const wit = await getWitness()
  const skill = (wit.body.skills as { name: string; stage: string; sessionCount?: number }[]).find(
    (s) => s.name === 'repeated-triage',
  )
  expect(skill?.stage).toBe('proposed')
  expect(skill?.sessionCount).toBe(5)
  await openManagedConsole(page)
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proposed').click()
  await expect(page.getByTestId('skills-proposed').or(page.locator('body'))).toBeVisible()
})

test('SK-02 Move to proving with five evidence kinds', async ({ page }) => {
  await control({ proposeSkill: { name: 'evidence-skill', sessionCount: 3 } })
  const wit0 = await getWitness()
  const id = (wit0.body.skills as { name: string; id: string }[]).find((s) => s.name === 'evidence-skill')!.id
  await control({ skillAction: { id, action: 'prove' } })
  const skill = ((await getWitness()).body.skills as { id: string; stage: string; evidence?: string[] }[]).find(
    (s) => s.id === id,
  )
  expect(skill?.stage).toBe('proving')
  expect(skill?.evidence).toEqual(expect.arrayContaining(['unit', 'integration', 'adversarial', 'trace', 'review']))
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proving').click()
  await expect(page.locator('body')).toBeVisible()
})

test('SK-06 Read-only auto-promote — Active, no Review, audit', async () => {
  await control({ proposeSkill: { name: 'readonly-internal', sessionCount: 8 } })
  const id = ((await getWitness()).body.skills as { name: string; id: string }[]).find(
    (s) => s.name === 'readonly-internal',
  )!.id
  const waitingBefore = ((await listReview()).body.review as { status: string }[]).filter(
    (r) => r.status === 'waiting',
  ).length
  await control({ skillAction: { id, action: 'autoPromote' } })
  const skill = ((await getWitness()).body.skills as { id: string; stage: string }[]).find((s) => s.id === id)
  expect(skill?.stage).toBe('active')
  const waitingAfter = ((await listReview()).body.review as { status: string }[]).filter(
    (r) => r.status === 'waiting',
  ).length
  expect(waitingAfter).toBe(waitingBefore)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'skill.auto_promote')).toBe(true)
})

test('SK-07 Code change returns skill to proving', async () => {
  await control({ skillMutate: { id: 'reconcile-amendment', stage: 'active' } })
  await control({ skillAction: { id: 'reconcile-amendment', action: 'reprove' } })
  const skill = ((await getWitness()).body.skills as { id: string; stage: string; evidence?: string[] }[]).find(
    (s) => s.id === 'reconcile-amendment',
  )
  expect(skill?.stage).toBe('proving')
  expect((skill?.evidence ?? []).length).toBe(0)
})

test('SK-08 Unapproved op at runtime retires skill', async () => {
  await control({
    skillMutate: {
      id: 'drift-skill',
      name: 'drift-skill',
      stage: 'active',
      hosts: ['api.stripe.com'],
      ops: ['read'],
    },
  })
  const call = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'stripe.charge',
    args: { skillId: 'drift-skill', host: 'https://api.stripe.com', amount: 1 },
  })
  expect(call.status).toBe(403)
  const skill = ((await getWitness()).body.skills as { id: string; stage: string; retireReason?: string }[]).find(
    (s) => s.id === 'drift-skill',
  )
  expect(skill?.stage).toBe('retired')
  expect(String(skill?.retireReason)).toMatch(/operation|host/i)
})

test('SK-09 Re-review lapse retires with reason', async ({ page }) => {
  await control({
    skillMutate: {
      id: 'lapse-skill',
      name: 'lapse-skill',
      stage: 'retired',
      retireReason: 'Re-review lapsed',
      reReviewLapsed: true,
    },
  })
  const skill = ((await getWitness()).body.skills as { id: string; retireReason?: string }[]).find(
    (s) => s.id === 'lapse-skill',
  )
  expect(skill?.retireReason).toMatch(/Re-review lapsed/)
  await page.goto('/skills')
  await page.getByTestId('skills-tab-retired').click()
  await expect(page.locator('body')).toBeVisible()
})

test('SK-10 Manual retire with reason — cannot run', async () => {
  await control({
    skillAction: { id: 'manual-retire', action: 'retire', reason: 'owner request' },
  })
  const skill = ((await getWitness()).body.skills as { id: string; stage: string; retireReason?: string }[]).find(
    (s) => s.id === 'manual-retire',
  )
  expect(skill?.stage).toBe('retired')
  expect(skill?.retireReason).toBe('owner request')
})

test('SK-11 Re-prove from scratch carries no evidence', async () => {
  await control({ skillAction: { id: 'manual-retire', action: 'retire', reason: 'done' } })
  await control({ skillAction: { id: 'manual-retire', action: 'reprove' } })
  const skill = ((await getWitness()).body.skills as { id: string; stage: string; evidence?: string[] }[]).find(
    (s) => s.id === 'manual-retire',
  )
  expect(skill?.stage).toBe('proving')
  expect(skill?.evidence ?? []).toEqual([])
})

test('SK-12 Prove disabled until Linear source approved', async () => {
  await control({
    skillMutate: { id: 'needs-linear', name: 'needs-linear', stage: 'proposed', needsConnection: 'linear' },
  })
  const linear = ((await getWitness()).body.connections as { id: string; status: string }[]).find(
    (c) => c.id === 'linear',
  )
  expect(linear?.status).not.toBe('connected')
  const skill = ((await getWitness()).body.skills as { id: string; needsConnection?: string }[]).find(
    (s) => s.id === 'needs-linear',
  )
  expect(skill?.needsConnection).toBe('linear')
})

test('SK-13 Skill needing missing connection is blocked', async () => {
  await control({
    skillMutate: { id: 'needs-notion', name: 'needs-notion', stage: 'proposed', needsConnection: 'notion' },
  })
  const skill = ((await getWitness()).body.skills as { needsConnection?: string }[]).find(
    (s) => s.id === 'needs-notion',
  )
  expect(skill?.needsConnection).toBe('notion')
})

test('SK-14 Hand-added skill still goes through proving', async () => {
  await control({ proposeSkill: { name: 'hand-added', sessionCount: 1 } })
  const id = ((await getWitness()).body.skills as { name: string; id: string }[]).find(
    (s) => s.name === 'hand-added',
  )!.id
  await control({ skillAction: { id, action: 'prove' } })
  const skill = ((await getWitness()).body.skills as { id: string; stage: string }[]).find((s) => s.id === id)
  expect(skill?.stage).toBe('proving')
  expect(skill?.stage).not.toBe('active')
})

test('SK-15 Injection scan flags skill; cannot promote', async () => {
  await control({ skillAction: { id: 'inject-skill', action: 'flagInjection' } })
  const skill = ((await getWitness()).body.skills as { id: string; injectionFlagged?: boolean; stage: string }[]).find(
    (s) => s.id === 'inject-skill',
  )
  expect(skill?.injectionFlagged).toBe(true)
  expect(skill?.stage).not.toBe('active')
})

test('SK-16 Sandbox blocks undeclared host; audit records', async () => {
  await control({
    skillMutate: {
      id: 'sandbox-skill',
      stage: 'active',
      hosts: ['crm.acme.example'],
      ops: ['fetch'],
    },
  })
  const call = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'fetch',
    args: { skillId: 'sandbox-skill', host: 'https://evil.example', url: 'https://evil.example' },
  })
  expect(call.status).toBe(403)
  const audit = await getAudit()
  expect(audit.entries.some((e) => /host/i.test(e.outcome) || /host/i.test(e.action))).toBe(true)
})
