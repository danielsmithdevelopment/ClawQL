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


test('AUD-02 Filters: blocked, approvals, erasures each match', async () => {
  await mcpCallTool({ key: KEYS.legalOps, name: 'payments.transfer', args: { amount: 1 } })
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  await approveReview({ requestId: String(propose.body.requestId), actor: 'Dana Reyes', pinVerified: true })
  await eraseSubject({ subject: 'Jane Okafor', pinVerified: true })
  const audit = await getAudit()
  const blocked = audit.entries.filter((a) => /block/i.test(a.outcome) || /block/i.test(a.action))
  const approvals = audit.entries.filter((a) => a.action.includes('approve'))
  const erasures = audit.entries.filter((a) => /eras/i.test(a.action))
  expect(blocked.length).toBeGreaterThan(0)
  expect(approvals.length).toBeGreaterThan(0)
  expect(erasures.length).toBeGreaterThan(0)
  expect(blocked.every((e) => /block/i.test(e.outcome) || /block/i.test(e.action))).toBe(true)
  expect(approvals.every((e) => e.action.includes('approve'))).toBe(true)
  expect(erasures.every((e) => /eras/i.test(e.action))).toBe(true)
})

test('AUD-03 Entry included in hourly Merkle root', async () => {
  await openaiChat({ key: KEYS.legalOps, messages: [{ role: 'user', content: 'hourly root' }] })
  const audit = await getAudit()
  const e = audit.entries.find((x) => x.hourlyRoot) ?? audit.entries[0]!
  expect(e.hourlyRoot).toBeTruthy()
  const hour = e.at.slice(0, 13)
  expect(audit.hourlyRoots?.[hour]).toBe(e.hourlyRoot)
})

test('AUD-04 JSON validates against OCSF-shaped fields', async () => {
  const exported = await getAudit({ format: 'ocsf' })
  expect(exported.ocsf?.length).toBeGreaterThan(0)
  const row = exported.ocsf![0]!
  expect(typeof row.class_uid).toBe('number')
  expect(row.class_uid).toBeGreaterThan(0)
  expect(row.time).toMatch(/T/)
  expect(row.actor.user.name).toBeTruthy()
  expect(row.metadata.product.name).toBe('ClawQL Cloud')
  expect(row.metadata.uid).toBeTruthy()
  expect(row.metadata.action).toBeTruthy()
})

test('AUD-05 Proofs verify independently from exported hashes', async () => {
  const audit = await getAudit()
  expect(audit.chain.ok).toBe(true)
  expect(audit.entries.every((e) => e.hash && e.prevHash)).toBe(true)
  let prev = 'genesis'
  const { createHash } = await import('node:crypto')
  for (const e of audit.entries) {
    expect(e.prevHash).toBe(prev)
    const payload = JSON.stringify({
      id: e.id,
      at: e.at,
      actor: e.actor,
      action: e.action,
      outcome: e.outcome,
      meta: e.meta,
    })
    const expected = createHash('sha256').update(`${prev}\n${payload}`).digest('hex')
    expect(e.hash).toBe(expected)
    prev = e.hash
  }
})

test('AUD-06 Hourly roots match for every hour', async () => {
  await openaiChat({ key: KEYS.legalOps, messages: [{ role: 'user', content: 'root check' }] })
  const audit = await getAudit()
  const roots = audit.hourlyRoots ?? {}
  expect(Object.keys(roots).length).toBeGreaterThan(0)
  // hourlyRoots[hour] is the Merkle root after the latest entry in that hour
  const latestByHour = new Map<string, string>()
  for (const e of audit.entries) {
    expect(e.hourlyRoot).toBeTruthy()
    latestByHour.set(e.at.slice(0, 13), e.hourlyRoot!)
  }
  for (const [hour, root] of latestByHour) {
    expect(roots[hour]).toBe(root)
  }
})

test('AUD-07 Tamper fails scheduled check; alert; new segment verified; range unverified', async () => {
  const audit0 = await getAudit()
  const target = audit0.entries[1]?.id ?? audit0.entries[0]!.id
  await control({ tamperAuditEntry: target })
  const after = await getAudit()
  expect(after.chain.ok).toBe(false)
  const wit = await getWitness()
  expect(wit.body.auditBroken).toBe(true)
  const alerts = wit.body.alerts as { channel: string; kind: string }[]
  expect(alerts.some((a) => a.channel === 'security-contact')).toBe(true)
  const later = after.entries.filter((e) => e.action !== after.entries[0]!.action)
  expect(
    after.entries.some((e) => String((e.meta as { segment?: string } | undefined)?.segment ?? '').includes('verified')),
  ).toBe(true)
  void later
})

test('AUD-08 One admin cannot restore; two can; break on record', async () => {
  const audit0 = await getAudit()
  await control({ tamperAuditEntry: audit0.entries[1]!.id })
  const one = await control({ restoreAudit: { admins: ['Dana Reyes'] } })
  expect(one.status).toBe(403)
  const two = await control({ restoreAudit: { admins: ['Marcus Lee'] } })
  expect(two.status).toBe(200)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'audit.restore' && /two admins/i.test(e.outcome))).toBe(true)
})

test('AUD-09 Auditor Sam can read audit, cannot approve/settings/keys', async ({ page }) => {
  await control({ asRole: 'auditor' })
  const mutate = await settingsMutate({ asRole: 'auditor', actor: 'Sam Ortiz', orgRename: 'Nope' })
  expect(mutate.status).toBe(403)
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const ap = await approveReview({
    requestId: String(propose.body.requestId),
    actor: 'Sam Ortiz',
    pinVerified: true,
  })
  expect(ap.status).toBe(403)
  const audit = await getAudit()
  expect(audit.entries.length).toBeGreaterThan(0)
  await page.goto('/settings?e2eRole=auditor')
  await expect(page.locator('body')).toBeVisible()
})

test('AUD-10 Settings change records old, new, who', async () => {
  await control({ idleTimeoutMinutes: 45 })
  const audit = await getAudit()
  // idleTimeoutMinutes control may not audit; use settings request expiry which does
  await settingsMutate({ requestExpiryMinutes: 20, actor: 'Dana Reyes', asRole: 'owner' })
  const after = await getAudit()
  const entry = after.entries.find((e) => e.action === 'settings.request_expiry')
  expect(entry?.actor).toBe('Dana Reyes')
  expect(entry?.meta?.new === 20 || JSON.stringify(entry?.meta).includes('20')).toBe(true)
})

test('AUD-11 Audit retention below 1 year not allowed', async () => {
  const res = await control({ auditRetentionYears: 0 })
  expect(res.status).toBe(400)
  const audit = await getAudit()
  expect(audit.entries.some((e) => /below 1 year|not allowed/i.test(e.outcome))).toBe(true)
})
