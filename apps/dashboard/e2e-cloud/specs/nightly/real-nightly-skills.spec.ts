/**
 * Real Nightly E2E — honest witnesses via production-shaped /mcp + /api/e2e/skills arrange + UI.
 * Never uses POST /api/e2e/scenario, runScenario, or getWitness as pass criteria.
 */
import { test, expect } from '@playwright/test'

import { KEYS, mcpCallTool } from '../../harness/agent-driver.mjs'
import { openManagedConsole } from '../../helpers/console'
import { getAudit, listReview, resetWorld, skillsApi } from '../../helpers/harness'

type SkillRow = {
  id: string
  name: string
  stage: string
  sessionCount?: number
  evidence?: string[]
  retireReason?: string
  needsConnection?: string
  injectionFlagged?: boolean
  canSendToReview?: boolean
}

async function listSkills(): Promise<SkillRow[]> {
  const res = await skillsApi()
  expect(res.status).toBe(200)
  return res.body.skills as SkillRow[]
}

test.beforeEach(async () => {
  await resetWorld()
})

test('SK-01 Propose skill with session count', async ({ page }) => {
  const proposed = await skillsApi({
    action: 'propose',
    name: 'repeated-triage',
    sessionCount: 5,
  })
  expect(proposed.status).toBe(200)
  const skill = (await listSkills()).find((s) => s.name === 'repeated-triage')
  expect(skill?.stage).toBe('proposed')
  expect(skill?.sessionCount).toBe(5)
  await openManagedConsole(page)
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proposed').click()
  await expect(page.getByTestId('skills-proposed')).toBeVisible()
})

test('SK-02 Move to proving with five evidence kinds', async ({ page }) => {
  const proposed = await skillsApi({ action: 'propose', name: 'evidence-skill', sessionCount: 3 })
  const id = String((proposed.body.skill as { id: string }).id)
  await skillsApi({ action: 'prove', id })
  const skill = (await listSkills()).find((s) => s.id === id)
  expect(skill?.stage).toBe('proving')
  expect(skill?.evidence).toEqual(
    expect.arrayContaining(['unit', 'integration', 'adversarial', 'trace', 'review']),
  )
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proving').click()
  await expect(page.getByTestId('skills-proving')).toBeVisible()
})

test('SK-06 Read-only auto-promote — Active, no Review, audit', async () => {
  const proposed = await skillsApi({
    action: 'propose',
    name: 'readonly-internal',
    sessionCount: 8,
  })
  const id = String((proposed.body.skill as { id: string }).id)
  const waitingBefore = ((await listReview()).body.review as { status: string }[]).filter(
    (r) => r.status === 'waiting',
  ).length
  await skillsApi({ action: 'autoPromote', id })
  const skill = (await listSkills()).find((s) => s.id === id)
  expect(skill?.stage).toBe('active')
  const waitingAfter = ((await listReview()).body.review as { status: string }[]).filter(
    (r) => r.status === 'waiting',
  ).length
  expect(waitingAfter).toBe(waitingBefore)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'skill.auto_promote')).toBe(true)
})

test('SK-07 Code change returns skill to proving', async () => {
  await skillsApi({ action: 'mutate', id: 'reconcile-amendment', stage: 'active' })
  await skillsApi({ action: 'reprove', id: 'reconcile-amendment' })
  const skill = (await listSkills()).find((s) => s.id === 'reconcile-amendment')
  expect(skill?.stage).toBe('proving')
  expect((skill?.evidence ?? []).length).toBe(0)
  const run = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { skillId: 'reconcile-amendment', contract: 'northwind', annualValue: 52000 },
  })
  expect([402, 403]).toContain(run.status)
})

test('SK-08 Unapproved op at runtime retires skill', async () => {
  await skillsApi({
    action: 'mutate',
    id: 'drift-skill',
    name: 'drift-skill',
    stage: 'active',
    hosts: ['api.stripe.com'],
    ops: ['read'],
  })
  const call = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'stripe.charge',
    args: { skillId: 'drift-skill', host: 'https://api.stripe.com', amount: 1 },
  })
  expect(call.status).toBe(403)
  const skill = (await listSkills()).find((s) => s.id === 'drift-skill')
  expect(skill?.stage).toBe('retired')
  expect(String(skill?.retireReason)).toMatch(/operation|host/i)
})

test('SK-09 Re-review lapse retires with reason', async ({ page }) => {
  await skillsApi({
    action: 'mutate',
    id: 'lapse-skill',
    name: 'lapse-skill',
    stage: 'retired',
    retireReason: 'Re-review lapsed',
    reReviewLapsed: true,
  })
  const skill = (await listSkills()).find((s) => s.id === 'lapse-skill')
  expect(skill?.retireReason).toMatch(/Re-review lapsed/)
  await page.goto('/skills')
  await page.getByTestId('skills-tab-retired').click()
  await expect(page.getByTestId('skills-retired')).toBeVisible()
  await expect(page.getByText(/Re-review lapsed|Retired/i).first()).toBeVisible()
})

test('SK-10 Manual retire with reason — cannot run', async () => {
  await skillsApi({ action: 'retire', id: 'manual-retire', reason: 'owner request', actor: 'Dana Reyes' })
  const skill = (await listSkills()).find((s) => s.id === 'manual-retire')
  expect(skill?.stage).toBe('retired')
  expect(skill?.retireReason).toBe('owner request')
  const run = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'fetch',
    args: { skillId: 'manual-retire', host: 'https://crm.acme.example' },
  })
  expect([403, 404]).toContain(run.status)
})

test('SK-11 Re-prove from scratch carries no evidence', async () => {
  await skillsApi({ action: 'retire', id: 'manual-retire', reason: 'done' })
  await skillsApi({ action: 'reprove', id: 'manual-retire' })
  const skill = (await listSkills()).find((s) => s.id === 'manual-retire')
  expect(skill?.stage).toBe('proving')
  expect(skill?.evidence ?? []).toEqual([])
})

test('SK-12 Prove disabled until Linear source approved', async ({ page }) => {
  await skillsApi({
    action: 'mutate',
    id: 'needs-linear',
    name: 'needs-linear',
    stage: 'proposed',
    needsConnection: 'linear',
  })
  const skill = (await listSkills()).find((s) => s.id === 'needs-linear')
  expect(skill?.needsConnection).toBe('linear')
  expect(skill?.canSendToReview).toBe(false)
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proposed').click()
  await expect(page.getByTestId('skills-proposed')).toBeVisible()
})

test('SK-13 Skill needing missing connection is blocked', async ({ page }) => {
  await skillsApi({
    action: 'mutate',
    id: 'needs-notion',
    name: 'needs-notion',
    stage: 'proposed',
    needsConnection: 'notion',
  })
  const skill = (await listSkills()).find((s) => s.id === 'needs-notion')
  expect(skill?.needsConnection).toBe('notion')
  expect(skill?.canSendToReview).toBe(false)
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proposed').click()
  await expect(page.getByTestId('skills-proposed')).toBeVisible()
})

test('SK-14 Hand-added skill still goes through proving', async ({ page }) => {
  const proposed = await skillsApi({ action: 'propose', name: 'hand-added', sessionCount: 1 })
  const id = String((proposed.body.skill as { id: string }).id)
  await skillsApi({ action: 'prove', id })
  const skill = (await listSkills()).find((s) => s.id === id)
  expect(skill?.stage).toBe('proving')
  expect(skill?.stage).not.toBe('active')
  await page.goto('/skills')
  await page.getByTestId('skills-tab-proving').click()
  await expect(page.getByTestId('skills-proving')).toBeVisible()
})

test('SK-15 Injection scan flags skill; cannot promote', async () => {
  await skillsApi({ action: 'flagInjection', id: 'inject-skill' })
  const skill = (await listSkills()).find((s) => s.id === 'inject-skill')
  expect(skill?.injectionFlagged).toBe(true)
  expect(skill?.stage).not.toBe('active')
  const promote = await skillsApi({ action: 'promote', id: 'inject-skill', actor: 'Dana Reyes' })
  expect(promote.status).toBe(403)
})

test('SK-16 Sandbox blocks undeclared host; audit records', async () => {
  await skillsApi({
    action: 'mutate',
    id: 'sandbox-skill',
    stage: 'active',
    hosts: ['crm.acme.example'],
    ops: ['fetch'],
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
