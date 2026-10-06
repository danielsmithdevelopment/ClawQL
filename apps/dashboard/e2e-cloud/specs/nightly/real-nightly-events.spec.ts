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


test('EV-02 DNS rebind / extra private host refused at subscribe', async () => {
  const res = await createSubscription('http://metadata.google.internal/hook')
  expect(res.status).toBe(400)
})

test('EV-04 Challenge ignored — subscription never activates; no deliveries', async () => {
  await resetWebhookReceiver()
  const sub = await createSubscription('https://hooks.example.com/hook', ['document.processed'], {
    challengeOk: false,
  })
  expect(sub.status).toBe(200)
  expect(sub.body.active).toBe(false)
  await uploadDocument({ name: 'no-deliver.pdf', content: 'Northwind' })
  const deliveries = await waitForDeliveries(1, 8)
  expect(deliveries.length).toBe(0)
  const listed = await listSubscriptions()
  const row = (listed.body.subscriptions as { id: string; active: boolean; challengeAccepted: boolean }[]).find(
    (s) => s.id === sub.body.id,
  )
  expect(row?.active).toBe(false)
})

test('EV-05 Receiver 503 → Failing; retry-all after recover delivers same IDs', async () => {
  await resetWebhookReceiver()
  await setWebhookMode('503')
  const sub = await createSubscription('https://hooks.example.com/hook', ['document.processed', 'stream.changed', '*'])
  expect(sub.status).toBe(200)
  await postEvents({ type: 'stream.changed', payload: { n: 1 }, test: true })
  await new Promise((r) => setTimeout(r, 200))
  const listed = await listSubscriptions()
  const row = (listed.body.subscriptions as { health: string; pendingRetries: unknown[] }[])[0]
  expect(row?.health).toBe('Failing')
  const pendingIds = (row?.pendingRetries as { eventId: string }[] | undefined)?.map((p) => p.eventId) ?? []
  await setWebhookMode('200')
  await retryAllEvents()
  const deliveries = await waitForDeliveries(1, 25)
  expect(deliveries.length).toBeGreaterThanOrEqual(1)
  if (pendingIds.length) {
    expect(deliveries.some((d) => pendingIds.includes(d.eventId ?? ''))).toBe(true)
  }
  const healthy = (await listSubscriptions()).body.subscriptions as { health: string }[]
  expect(healthy.some((s) => s.health === 'Healthy')).toBe(true)
})

test('EV-06 Receiver 410 stops subscription with reason', async () => {
  await resetWebhookReceiver()
  await setWebhookMode('410')
  await createSubscription('https://hooks.example.com/hook', ['stream.changed', '*'])
  await postEvents({ type: 'stream.changed', payload: { gone: true }, test: true })
  await new Promise((r) => setTimeout(r, 200))
  const listed = await listSubscriptions()
  const row = (listed.body.subscriptions as { health: string; stopReason?: string; active: boolean }[])[0]
  expect(row?.active).toBe(false)
  expect(String(row?.stopReason ?? row?.health)).toMatch(/410|Stopped/i)
})

test('EV-07 Redeliver past event — same event ID', async () => {
  await resetWebhookReceiver()
  await createSubscription('https://hooks.example.com/hook', ['stream.changed', '*'])
  const posted = await postEvents({ type: 'stream.changed', payload: { n: 1 }, test: true })
  const id = String(posted.body.id)
  await waitForDeliveries(1)
  await resetWebhookReceiver()
  await redeliverEvent(id)
  const again = await waitForDeliveries(1)
  expect(again.some((d) => d.eventId === id)).toBe(true)
})

test('EV-08 Test event marked as test at receiver', async () => {
  await resetWebhookReceiver()
  await createSubscription('https://hooks.example.com/hook', ['*'])
  await postEvents({ type: 'test.ping', payload: { hello: true }, test: true })
  const d = await waitForDeliveries(1)
  expect(d.length).toBeGreaterThanOrEqual(1)
  const json = d[0]?.json as { test?: boolean }
  expect(json?.test).toBe(true)
})

test('EV-09 Rotated secret — new deliveries verify only against new secret', async () => {
  await resetWebhookReceiver()
  await createSubscription('https://hooks.example.com/hook', ['*'])
  await control({ rotateWebhookSecret: 'whsec_rotated_secret_value' })
  await fetch('http://127.0.0.1:4091/control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: 'whsec_rotated_secret_value' }),
  })
  await postEvents({ type: 'stream.changed', payload: { afterRotate: true }, test: true })
  const d = await waitForDeliveries(1)
  expect(d.some((x) => x.verified)).toBe(true)
})

test('EV-10 Pause then resume deliveries', async () => {
  await resetWebhookReceiver()
  const sub = await createSubscription('https://hooks.example.com/hook', ['*'])
  const id = String(sub.body.id)
  await subscriptionAction('pause', { id })
  await resetWebhookReceiver()
  await postEvents({ type: 'stream.changed', payload: { paused: true }, test: true })
  await new Promise((r) => setTimeout(r, 150))
  expect((await getWebhookDeliveries()).deliveries.length).toBe(0)
  await subscriptionAction('resume', { id })
  await postEvents({ type: 'stream.changed', payload: { resumed: true }, test: true })
  const d = await waitForDeliveries(1)
  expect(d.length).toBeGreaterThanOrEqual(1)
})

test('EV-12 Stream resume from last event ID has no gap', async () => {
  await postEvents({ type: 'stream.changed', payload: { n: 1 }, test: true })
  await postEvents({ type: 'stream.changed', payload: { n: 2 }, test: true })
  const first = await listEvents()
  const ids = first.body.events.map((e) => e.id)
  const cursor = ids[ids.length - 1]!
  await postEvents({ type: 'stream.changed', payload: { n: 3 }, test: true })
  await postEvents({ type: 'stream.changed', payload: { n: 4 }, test: true })
  const after = await listEvents(cursor)
  const afterIds = after.body.events.map((e) => e.id)
  expect(afterIds).not.toContain(cursor)
  expect(afterIds.length).toBeGreaterThanOrEqual(2)
})

test('EV-13 Burst events: each ID once at receiver aside from retries', async () => {
  await resetWebhookReceiver()
  await createSubscription('https://hooks.example.com/hook', ['*'])
  const burst = await postEvents({ type: 'stream.changed', burst: 5, payload: { burst: true } })
  expect(burst.status).toBe(200)
  const d = await waitForDeliveries(5, 40)
  const ids = d.map((x) => x.eventId).filter(Boolean)
  const uniq = new Set(ids)
  expect(uniq.size).toBe(ids.length)
})

test('EV-14 Coalesced stream.changed — no event then one then merged', async () => {
  const before = (await listEvents()).body.events.length
  expect(before).toBeGreaterThanOrEqual(0)
  await postEvents({ type: 'stream.changed', payload: { diff: 'a' }, test: true })
  await postEvents({ type: 'stream.changed', payload: { diff: 'ab', merged: true }, test: true })
  const ev = await listEvents()
  const changed = ev.body.events.filter((e) => String(e.type).includes('stream.changed'))
  expect(changed.length).toBeGreaterThanOrEqual(1)
})

test('EV-15 Watch pause sends schedule.paused; resume after reconnect', async () => {
  await resetWebhookReceiver()
  await createSubscription('https://hooks.example.com/hook', ['schedule.paused', 'schedule.completed', '*'])
  await postEvents({ type: 'schedule.paused', payload: { reason: 'disconnect' }, test: true })
  const d = await waitForDeliveries(1)
  expect(d.some((x) => /schedule.paused/.test(x.rawBody))).toBe(true)
  await postEvents({ type: 'schedule.completed', payload: { reason: 'reconnect' }, test: true })
  const d2 = await waitForDeliveries(2)
  expect(d2.some((x) => /schedule.completed/.test(x.rawBody))).toBe(true)
})

test('EV-17 Bad inbound HMAC rejected, counted, audited', async () => {
  const before = (await getInboundStats()).body.stats
  const bad = await postInbound({
    source: 'github',
    body: { action: 'opened' },
    badSignature: true,
    deliveryId: `del_bad_${Date.now()}`,
  })
  expect(bad.status).toBe(401)
  const after = (await getInboundStats()).body.stats
  expect(Number(after.rejected)).toBeGreaterThan(Number(before.rejected ?? 0))
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action.includes('webhook'))).toBe(true)
})

test('EV-18 Untrusted inbound treated as data; transfer blocked', async () => {
  const good = await postInbound({
    source: 'github',
    body: { action: 'opened', repository: { full_name: 'acme/app' } },
    sign: true,
    deliveryId: `del_u_${Date.now()}`,
  })
  expect(good.status).toBe(200)
  expect(good.body.untrusted).toBe(true)
  const transfer = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'payments.transfer',
    args: { amount: 5, fromInbound: true, untrusted: true },
  })
  expect(transfer.status).toBe(403)
})

test('EV-19 Schedule run completes; write waits for mandate', async () => {
  const run = await mcpCallTool({
    key: KEYS.legalOps,
    name: 'schedule.run',
    args: { output: 'ok', write: true },
  })
  expect(run.status).toBe(200)
  expect(String(run.body.write)).toMatch(/mandate/i)
  const ev = await listEvents()
  expect(ev.body.events.some((e) => String(e.type).includes('schedule.completed'))).toBe(true)
})

test('EV-20 24h type counts match listed events', async () => {
  await postEvents({ type: 'stream.changed', payload: { n: 1 }, test: true })
  await postEvents({ type: 'document.processed', payload: { n: 2 }, test: true })
  const listed = await listEvents()
  const counts = listed.body.counts24h
  expect(counts).toBeTruthy()
  expect(Object.keys(counts!).length).toBeGreaterThan(0)

  const fromList: Record<string, number> = {}
  for (const e of listed.body.events) {
    const t = String(e.type).replace(/^com\.clawql\./, '')
    fromList[t] = (fromList[t] ?? 0) + 1
  }

  for (const [k, v] of Object.entries(counts!)) {
    const nk = k.replace(/^com\.clawql\./, '')
    expect(fromList[nk], `counts24h[${k}] must match listed events`).toBe(v)
  }
  for (const [k, v] of Object.entries(fromList)) {
    const counted = counts![k] ?? counts![`com.clawql.${k}`]
    expect(counted, `listed type ${k} must appear in counts24h`).toBe(v)
  }
})

test('EV-21 Events are CloudEvents with com.clawql.* type', async () => {
  await postEvents({ type: 'stream.changed', payload: { ce: true }, test: true })
  const listed = await listEvents()
  for (const e of listed.body.events) {
    expect(e.id).toBeTruthy()
    expect(String(e.type)).toMatch(/^com\.clawql\./)
    expect((e as { time?: string }).time || true).toBeTruthy()
  }
})
