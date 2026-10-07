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
  gatewayRestart,
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


test('RES-01 Client retries continue the same session', async () => {
  const a = await openaiChat({
    key: KEYS.legalOps,
    messages: [{ role: 'user', content: 'retry-1' }],
  })
  expect(a.status).toBe(200)
  const sessionId = a.body.clawql?.sessionId
  expect(sessionId).toBeTruthy()
  const restart = await gatewayRestart()
  expect(restart.status).toBe(200)
  const b = await openaiChat({
    key: KEYS.legalOps,
    messages: [{ role: 'user', content: 'retry-2' }],
  })
  expect(b.status).toBe(200)
  expect(b.body.clawql?.sessionId).toBe(sessionId)
  const mem = await memoryGet('')
  const sess = (mem.body.sessions as { id: string; keyName: string; spendCents: number }[]).find(
    (s) => s.keyName === 'legal-ops',
  )
  expect(sess?.id).toBe(sessionId)
  expect(sess?.spendCents).toBeGreaterThan(2)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'gateway.restart')).toBe(true)
})

test('RES-02 Events keep original IDs after receiver outage', async () => {
  await resetWebhookReceiver()
  await setWebhookMode('503')
  await createSubscription('https://hooks.example.com/hook', ['*'])
  const posted = await postEvents({ type: 'stream.changed', payload: { outage: true }, test: true })
  const id = String(posted.body.id)
  await setWebhookMode('200')
  await retryAllEvents()
  const d = await waitForDeliveries(1)
  expect(d.some((x) => x.eventId === id)).toBe(true)
})

test('RES-04 Info-flow unreachable refuses data-moving calls', async () => {
  await control({ infoFlowUnreachable: true })
  const slack = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'slack.post',
    args: { text: 'hi' },
  })
  expect(slack.status).toBe(503)
  const email = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'email.send',
    args: { to: 'a@b.com' },
  })
  expect(email.status).toBe(503)
})

test('RES-05 Live stream resumes from last event ID; none lost', async () => {
  await postEvents({ type: 'stream.changed', payload: { n: 1 }, test: true })
  const first = await listEvents()
  const last = first.body.events[first.body.events.length - 1]!.id
  const known = new Set(first.body.events.map((e) => e.id))
  await postEvents({ type: 'stream.changed', payload: { n: 2 }, test: true })
  await postEvents({ type: 'stream.changed', payload: { n: 3 }, test: true })
  const after = await listEvents(last)
  expect(after.body.events.map((e) => e.id)).not.toContain(last)
  expect(after.body.events.length).toBeGreaterThanOrEqual(2)
  const full = await listEvents()
  const fullIds = full.body.events.map((e) => e.id)
  for (const id of known) {
    expect(fullIds).toContain(id)
  }
  for (const e of after.body.events) {
    expect(fullIds).toContain(e.id)
    expect(known.has(e.id)).toBe(false)
  }
})

test('RES-06 Review request survives reset-equivalent pause; approve afterwards works', async () => {
  const propose = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  const requestId = String(propose.body.requestId)
  const waiting = ((await listReview()).body.review as { id: string; status: string }[]).find(
    (r) => r.id === requestId,
  )
  expect(waiting?.status).toBe('waiting')
  await gatewayRestart()
  const still = ((await listReview()).body.review as { id: string; status: string }[]).find(
    (r) => r.id === requestId,
  )
  expect(still?.status).toBe('waiting')
  const ap = await approveReview({ requestId, actor: 'Dana Reyes', pinVerified: true })
  expect(ap.status).toBe(200)
  const write = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'adjust_contract_value',
    args: { ...NORTHWIND },
  })
  expect(write.status).toBe(200)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'gateway.restart')).toBe(true)
})

test('RES-07 Deletion job retries remaining step and finishes without repeating', async () => {
  const stop = await eraseSubject({ subject: 'Jane Okafor', pinVerified: true, stopHalfway: true })
  const jobId = String(stop.body.jobId ?? (stop.body.job as { id: string }).id)
  const resume = await eraseSubject({ resumeJobId: jobId, pinVerified: true })
  const steps = (resume.body.job as { steps: string[] }).steps
  expect(new Set(steps).size).toBe(steps.length)
  expect((resume.body.job as { certificateReady: boolean }).certificateReady).toBe(true)
})

test('RES-08 Fallbacks used; private route stays private; no unapproved provider', async () => {
  await control({ breakProvider: { route: 'frugal', broken: true } })
  const frugal = await openaiChat({
    key: KEYS.legalOps,
    model: 'frugal',
    messages: [{ role: 'user', content: 'fb' }],
  })
  expect(frugal.status).toBe(200)
  expect(frugal.body.clawql?.usingFallback).toBe(true)
  await control({ breakProvider: { route: 'private', broken: true } })
  const priv = await openaiChat({
    key: KEYS.legalOps,
    model: 'private',
    messages: [{ role: 'user', content: 'local' }],
  })
  expect(priv.status).toBe(503)
  expect(JSON.stringify(priv.body).toLowerCase()).not.toContain('unapproved')
})

test('RES-09 World restart: smoke-equivalent chat works; audit chain verifies', async () => {
  await openaiChat({ key: KEYS.legalOps, messages: [{ role: 'user', content: 'pre-restart' }] })
  await resetWorld()
  const audit = await getAudit()
  expect(audit.chain.ok).toBe(true)
  const chat = await openaiChat({
    key: KEYS.legalOps,
    messages: [{ role: 'user', content: 'post-restart' }],
  })
  expect(chat.status).toBe(200)
  const after = await getAudit()
  expect(after.chain.ok).toBe(true)
})
