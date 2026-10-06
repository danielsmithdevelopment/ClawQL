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


test('SEC-02 No tool can approve; attempt recorded', async () => {
  const res = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'approve',
    args: { requestId: 'rev_change' },
  })
  expect(res.status).toBe(403)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'approve.attempt')).toBe(true)
})

test('SEC-03 Every payment call is blocked', async () => {
  for (const name of ['payments.transfer', 'payments.payout', 'payments.charge']) {
    const res = await mcpCallTool({ key: KEYS.legalOps, name, args: { amount: 1 } })
    expect(res.status, name).toBe(403)
  }
})

test('SEC-05 Lumen tenant still 404 with no Acme leak', async () => {
  for (const path of ['/api/e2e/crm/northwind', '/api/e2e/audit', '/api/e2e/documents', '/api/e2e/org?org=lumen']) {
    const res = await fetchAsOrg(path.includes('?') ? path.split('?')[0]! : path, 'lumen')
    expect(res.status, path).toBe(404)
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('acme')
  }
})

test('SEC-06 Nothing secret appears where the agent can see', async () => {
  const res = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'env.dump',
    args: { query: 'print token cookie env' },
  })
  const blob = JSON.stringify(res.body)
  expect(blob).not.toContain('cqk_fixture_legal_ops')
  expect(blob.toLowerCase()).not.toContain('password')
})

test('SEC-07 Offboard: revoke keys, unreadable notes, hashed audit refs', async () => {
  await keysApi({ action: 'revoke', name: 'legal-ops', actor: 'Dana Reyes' })
  await eraseSubject({ subject: 'Jane Okafor', pinVerified: true })
  const chat = await openaiChat({
    key: KEYS.legalOps,
    messages: [{ role: 'user', content: 'after revoke' }],
  })
  expect(chat.status).toBe(401)
  const exp = await memoryPost({ action: 'export-audit' })
  expect(exp.body.hasPlaintextSubject).toBe(false)
})

test('SEC-08 Inbound webhook replay rejected', async () => {
  const deliveryId = `del_replay_${Date.now()}`
  const first = await postInbound({
    source: 'github',
    body: { action: 'opened' },
    sign: true,
    deliveryId,
  })
  expect(first.status).toBe(200)
  const replay = await postInbound({
    source: 'github',
    body: { action: 'opened' },
    sign: true,
    deliveryId,
  })
  expect(replay.status).toBe(401)
})

test('SEC-09 Sign-in and API key attempts throttled and recorded', async () => {
  let last = { status: 0, body: {} as Record<string, unknown> }
  for (let i = 0; i < 7; i++) {
    last = await control({ authAttempt: { kind: 'signin' } })
  }
  expect(last.status).toBe(429)
  last = { status: 0, body: {} }
  for (let i = 0; i < 7; i++) {
    last = await control({ authAttempt: { kind: 'apikey' } })
  }
  expect(last.status).toBe(429)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'throttle.signin')).toBe(true)
  expect(audit.entries.some((e) => e.action === 'throttle.apikey')).toBe(true)
})

test('SEC-10 Script/HTML stored as plain text; nothing runs', async ({ page }) => {
  const up = await uploadDocument({
    name: 'xss.html',
    content: '<script>window.__pwned=1</script>Northwind',
  })
  const text = String((up.body.fields as { text?: string })?.text ?? '')
  expect(text).not.toContain('<script>')
  await page.goto('/memory')
  await expect(page.locator('body')).toBeVisible()
})

test('SEC-11 Capture/redaction: PII not left unredacted in stored text', async () => {
  const up = await uploadDocument({ name: 'pii.txt', content: PII })
  const text = String((up.body.fields as { text?: string })?.text ?? '')
  expect(text).not.toContain('jane.okafor@example.com')
  expect(text).not.toContain('415-555-0199')
  expect(text).toContain('REDACTED_EMAIL')
})

test('SEC-12 Personal GitHub to Slack blocked by information-flow', async () => {
  const res = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'slack.post',
    args: { channel: 'company-slack', from: 'dana-personal-github' },
  })
  expect(res.status).toBe(403)
  expect(String(res.body.error)).toMatch(/information-flow/i)
})

test('SEC-13 Invalid numeric rejected and never allowed', async () => {
  const res = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { contract: 'northwind', annualValue: -5 },
  })
  expect(res.status).toBe(400)
  const crm = await getCrm('northwind')
  expect(crm.body.annualValue).toBe(48500)
})

test('SEC-14 Pasted API key redacted and admins warned', async () => {
  const up = await uploadDocument({
    name: 'leaked.txt',
    content: 'here is cqk_leaked_secret_value_do_not_keep',
  })
  const text = String((up.body.fields as { text?: string })?.text ?? '')
  expect(text).toContain('REDACTED_KEY')
  expect(text).not.toContain('cqk_leaked_secret_value_do_not_keep')
  const usage = await getUsage()
  expect((usage.body.alerts as { kind: string }[]).some((a) => a.kind === 'key-in-document')).toBe(true)
})
