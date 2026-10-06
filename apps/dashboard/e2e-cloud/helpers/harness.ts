import { createHmac } from 'node:crypto'

const base = () => process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040'
const webhook = () => process.env.CLAWQL_E2E_WEBHOOK_BASE ?? 'http://127.0.0.1:4091'

async function json<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T
}

async function fetchRetry(url: string, init?: RequestInit, attempts = 5): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init)
      // Next HMR can briefly return 500 while recompiling routes
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)))
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 250 * (i + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function resetWorld() {
  const res = await fetchRetry(`${base()}/api/e2e/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`reset failed: ${res.status}`)
  return json(res)
}

export async function getAudit() {
  const res = await fetch(`${base()}/api/e2e/audit`)
  if (!res.ok) throw new Error(`audit failed: ${res.status}`)
  return json<{
    entries: { id: string; actor: string; action: string; outcome: string; meta?: Record<string, unknown> }[]
    chain: { ok: boolean; entries: number; latestRoot?: string }
  }>(res)
}

export async function getCrm(contractId: string) {
  const res = await fetch(`${base()}/api/e2e/crm/${contractId}`)
  return { status: res.status, body: await json<{ annualValue: number; display: string; error?: string }>(res) }
}

export async function approveReview(input: {
  requestId: string
  actor?: string
  keyKind?: 'device-bound' | 'synced'
  pinVerified?: boolean
  approve?: boolean
  reason?: string
  aaguid?: string
  signatureCounter?: number
}) {
  const res = await fetch(`${base()}/api/e2e/review/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      keyKind: 'device-bound',
      pinVerified: true,
      approve: true,
      ...input,
    }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function listReview() {
  const res = await fetch(`${base()}/api/e2e/review`)
  return { status: res.status, body: await json<{ review: unknown[]; badges: Record<string, number> }>(res) }
}

export async function control(body: Record<string, unknown>) {
  const res = await fetch(`${base()}/api/e2e/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function createSubscription(
  url: string,
  events: string[] = ['document.processed'],
  extra: Record<string, unknown> = {},
) {
  const res = await fetch(`${base()}/api/e2e/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, events, ...extra }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function uploadDocument(input: {
  name: string
  content: string
  kind?: string
  key?: string
}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (input.key) headers.authorization = `Bearer ${input.key}`
  const res = await fetch(`${base()}/api/e2e/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: input.name, content: input.content, kind: input.kind }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function eraseSubject(input: {
  subject: string
  actor?: string
  pinVerified?: boolean
  stopHalfway?: boolean
  resumeJobId?: string
}) {
  const res = await fetch(`${base()}/api/e2e/erase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function searchErased(q: string) {
  const res = await fetch(`${base()}/api/e2e/erase?q=${encodeURIComponent(q)}`)
  return { status: res.status, body: await json<{ results: unknown[] }>(res) }
}

export async function memorySearch(q: string, opts: Record<string, unknown> = {}) {
  const res = await fetch(`${base()}/api/e2e/memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q, ...opts }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function keysApi(body?: Record<string, unknown>) {
  if (!body) {
    const res = await fetch(`${base()}/api/e2e/keys`)
    return { status: res.status, body: await json<Record<string, unknown>>(res) }
  }
  const res = await fetch(`${base()}/api/e2e/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function listEvents(after?: string) {
  const url = after
    ? `${base()}/api/e2e/events?after=${encodeURIComponent(after)}`
    : `${base()}/api/e2e/events`
  const res = await fetch(url)
  return { status: res.status, body: await json<{ events: { id: string; type: string; data?: unknown }[] }>(res) }
}

export async function postInbound(input: {
  source: string
  body: unknown
  signature?: string
  timestamp?: string
  deliveryId?: string
  /** When true, sign the raw body with world webhook secret (whsec_test_acme). */
  sign?: boolean
  secret?: string
  badSignature?: boolean
}) {
  const payload =
    typeof input.body === 'object' && input.body !== null
      ? { source: input.source, ...(input.body as Record<string, unknown>) }
      : { source: input.source, payload: input.body }
  const rawBody = JSON.stringify(payload)
  const secret = input.secret ?? 'whsec_test_acme'
  let signature = input.signature
  if (input.badSignature) {
    signature = 'sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  } else if (input.sign || (!signature && input.source === 'github')) {
    signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  }
  const res = await fetch(`${base()}/api/e2e/inbound`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
      ...(input.timestamp ? { 'x-hub-timestamp': input.timestamp } : {}),
      ...(input.deliveryId ? { 'x-github-delivery': input.deliveryId } : {}),
    },
    body: rawBody,
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function getUsage() {
  const res = await fetch(`${base()}/api/e2e/usage`)
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function settingsMutate(input: Record<string, unknown>) {
  const res = await fetch(`${base()}/api/e2e/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function fetchAsOrg(path: string, org: string) {
  const res = await fetch(`${base()}${path}`, { headers: { 'x-org': org } })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function postEvents(input: Record<string, unknown>) {
  const res = await fetch(`${base()}/api/e2e/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function stripeCheckout(input: {
  signedInUserId?: string
  foreignUserId?: string
  replay?: boolean
  testCard?: string
}) {
  const res = await fetch(`${base()}/api/e2e/stripe/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function getOrg() {
  const res = await fetch(`${base()}/api/e2e/org`)
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function decisionCall(input: {
  key: string
  site: string
  text?: string
  answer?: string
  actor?: string
  questionType?: string
}) {
  const res = await fetch(`${base()}/api/e2e/decision`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function resetWebhookReceiver() {
  const res = await fetch(`${webhook()}/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reset: true, mode: '200' }),
  })
  return json(res)
}

export async function setWebhookMode(mode: '200' | '503' | '410') {
  const res = await fetch(`${webhook()}/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  return json(res)
}

export async function getWebhookDeliveries() {
  const res = await fetch(`${webhook()}/deliveries`)
  return json<{
    deliveries: {
      at: string
      headers: Record<string, string>
      rawBody: string
      json: unknown
      verified: boolean
      eventId: string | null
    }[]
  }>(res)
}

export { base as harnessBase, webhook as webhookBase }
