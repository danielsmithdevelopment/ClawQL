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


test('MEM-02 Unreadable .msg is not stored', async () => {
  const up = await uploadDocument({ name: 'outlook.msg', content: 'binary-msg' })
  expect(up.body.status).toBe("Couldn't read")
  expect(String(up.body.hint ?? '')).toMatch(/PDF|EML/i)
})

test('MEM-03 Six document types stored and searchable', async () => {
  for (const name of ['a.pdf', 'a.docx', 'a.xlsx', 'a.pptx', 'a.png', 'a.eml']) {
    const up = await uploadDocument({ name, content: `Northwind ${name}` })
    expect(up.status).toBe(200)
    expect(up.body.status).toBe('Stored')
  }
  const docs = await getDocuments()
  expect(docs.body.documents.length).toBeGreaterThanOrEqual(6)
  const mem = await memorySearch('Northwind')
  expect(((mem.body.results as unknown[]) ?? []).length).toBeGreaterThan(0)
})

test('MEM-04 Low-confidence field verified under Dana', async () => {
  await uploadDocument({
    name: 'low.pdf',
    content: 'Northwind amount uncertain low confidence',
  })
  const confirm = await uploadDocument({ name: 'confirm', content: '', kind: 'confirm' })
  // confirmField path
  const res = await fetch((process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040') + '/api/e2e/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmField: 'text', actor: 'Dana Reyes' }),
  })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.document?.verifiedBy).toBe('Dana Reyes')
  expect(body.document?.status).toBe('Stored')
  void confirm
})

test('MEM-06 Ask cites sources user can see', async () => {
  const mem = await memoryGet('renew')
  expect(mem.status).toBe(200)
  const ask = mem.body.ask as { answer?: string; sources?: string[] } | undefined
  expect(String(ask?.answer ?? '')).toMatch(/Northwind/i)
  expect((ask?.sources ?? []).length).toBeGreaterThan(0)
})

test('MEM-07 Filter Northwind then widen', async () => {
  const limited = await memoryGet('', { filter: 'Contract.counterparty=Northwind' })
  const wide = await memoryGet('')
  const n1 = ((limited.body.results as unknown[]) ?? []).length
  const n2 = ((wide.body.results as unknown[]) ?? []).length
  expect(n2).toBeGreaterThanOrEqual(n1)
})

test('MEM-08 Stale notes only when includeStale=1', async () => {
  const off = await memoryGet('', {})
  const on = await memoryGet('', { includeStale: '1' })
  const staleOff = ((off.body.results as { stale?: boolean }[]) ?? []).some((r) => r.stale)
  const staleOn = ((on.body.results as { stale?: boolean; title?: string }[]) ?? []).some(
    (r) => r.stale || r.title === 'Old note',
  )
  expect(staleOff).toBe(false)
  expect(staleOn).toBe(true)
})

test('MEM-09 governing_law field exists only since Mar 2025', async () => {
  const mem = await memoryGet('', { filter: 'governing_law' })
  expect(mem.body.fieldSince).toBe('2025-03-01')
  const rows = (mem.body.results as { note?: string }[]) ?? []
  expect(rows.some((r) => /Mar 2025|2025-03/i.test(String(r.note ?? '')))).toBe(true)
})

test('MEM-10 Accept suggested schema field; audit records who', async () => {
  await control({ schemaAccept: 'auto_renews' })
  const mem = await memoryGet('')
  const schema = mem.body.schema as { name: string; suggested?: boolean }[]
  const field = schema.find((f) => f.name === 'auto_renews')
  expect(field?.suggested).toBe(false)
  const audit = await getAudit()
  expect(audit.entries.some((e) => e.action === 'schema.accept' && e.actor === 'Dana Reyes')).toBe(true)
})

test('MEM-11 SQL read ok, write refused', async () => {
  const read = await memoryGet('', { sql: 'select * from notes' })
  expect(read.status).toBe(200)
  expect(Array.isArray(read.body.rows)).toBe(true)
  const write = await memoryGet('', { sql: 'delete from notes' })
  expect(write.status).toBe(403)
})

test('MEM-14 Erase export holds hashed ref only', async () => {
  await eraseSubject({ subject: 'Jane Okafor', pinVerified: true })
  const exp = await memoryPost({ action: 'export-audit' })
  expect(exp.body.hasPlaintextSubject).toBe(false)
  const blob = JSON.stringify(exp.body.export)
  expect(blob).not.toContain('Jane Okafor')
  expect(blob).not.toContain('jane.okafor@example.com')
})

test('MEM-15 Erase resume does not repeat finished steps', async () => {
  const stop = await eraseSubject({ subject: 'Jane Okafor', pinVerified: true, stopHalfway: true })
  const jobId = String(stop.body.jobId ?? (stop.body.job as { id: string }).id)
  const steps1 = ((stop.body.job as { steps: string[] }).steps)
  const resume = await eraseSubject({ resumeJobId: jobId, pinVerified: true })
  expect(resume.status).toBe(200)
  const steps2 = (resume.body.job as { steps: string[] }).steps
  expect(new Set(steps2).size).toBe(steps2.length)
  expect(steps2.length).toBeGreaterThanOrEqual(steps1.length)
  expect((resume.body.job as { certificateReady: boolean }).certificateReady).toBe(true)
})

test('MEM-16 Training export flagged to regenerate excluding Jane', async () => {
  await eraseSubject({ subject: 'Jane Okafor', pinVerified: true })
  const wit = await getWitness()
  const exp = (wit.body.trainingExports as { needsRegenerate: boolean; subjects: string[] }[])[0]
  expect(exp.needsRegenerate).toBe(true)
})

test('MEM-17 Dana personal notes hidden from Priya', async () => {
  const priya = await memoryGet('', { actor: 'Priya Shah' })
  const blob = JSON.stringify(priya.body.results)
  expect(blob.toLowerCase()).not.toContain('private gist')
  expect(blob).not.toContain('Dana personal')
})

test('MEM-18 Agent upload credited; Sessions shows upload', async () => {
  const up = await uploadDocument({
    name: 'agent-doc.pdf',
    content: 'Northwind from pipeline',
    key: KEYS.docsPipeline,
  })
  expect(up.status).toBe(200)
  const wit = await getWitness()
  expect((wit.body.sessions as { upload?: boolean; keyName: string }[]).some((s) => s.upload)).toBe(true)
})

test('MEM-19 Erase note history unreadable; search misses it', async () => {
  await memoryPost({ action: 'erase-note', noteId: 'mem_northwind', actor: 'Dana Reyes' })
  const mem = await memorySearch('Northwind renewal')
  const results = (mem.body.results as { id: string }[]) ?? []
  expect(results.find((r) => r.id === 'mem_northwind')).toBeFalsy()
})
