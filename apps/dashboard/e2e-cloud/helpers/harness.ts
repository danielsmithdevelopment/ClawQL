import { createHmac } from 'node:crypto'

const base = () => process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040'
const webhook = () => process.env.CLAWQL_E2E_WEBHOOK_BASE ?? 'http://127.0.0.1:4091'

async function json<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T
}

async function fetchRetry(url: string, init?: RequestInit, attempts = 10): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init)
      // Next HMR can briefly return 500 while recompiling routes
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Block until the managed console answers — used when Next was killed/restarted mid-suite. */
export async function waitForServer(timeoutMs = 120_000): Promise<void> {
  const start = Date.now()
  let lastErr: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base()}/`)
      if (res.ok || res.status === 304) return
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`server not reachable at ${base()} within ${timeoutMs}ms`)
}

export async function resetWorld() {
  await waitForServer()
  const res = await fetchRetry(`${base()}/api/e2e/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`reset failed: ${res.status}`)
  return json(res)
}

export async function getAudit(opts?: { format?: 'ocsf' }) {
  const qs = opts?.format === 'ocsf' ? '?format=ocsf' : ''
  const res = await fetchRetry(`${base()}/audit${qs}`)
  if (!res.ok) throw new Error(`audit failed: ${res.status}`)
  return json<{
    entries: {
      id: string
      at: string
      actor: string
      action: string
      outcome: string
      hash?: string
      prevHash?: string
      hourlyRoot?: string
      meta?: Record<string, unknown>
    }[]
    chain: { ok: boolean; entries: number; latestRoot?: string }
    hourlyRoots?: Record<string, string>
    auditBroken?: boolean
    alerts?: { channel: string; kind: string }[]
    ocsf?: {
      class_uid: number
      activity_id: number
      time: string
      actor: { user: { name: string } }
      metadata: { product: { name: string }; uid: string; action: string; outcome: string }
    }[]
  }>(res)
}

export async function skillsApi(): Promise<{
  status: number
  body: { skills: Record<string, unknown>[] }
}>
export async function skillsApi(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> & { skill?: { id: string } } }>
export async function skillsApi(body?: Record<string, unknown>) {
  if (!body) {
    const res = await fetchRetry(`${base()}/api/e2e/skills`)
    return { status: res.status, body: await json<{ skills: Record<string, unknown>[] }>(res) }
  }
  const res = await fetchRetry(`${base()}/api/e2e/skills`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await json<Record<string, unknown> & { skill?: { id: string } }>(res) }
}

export async function getCrm(contractId: string) {
  const res = await fetchRetry(`${base()}/api/e2e/crm/${contractId}`)
  return { status: res.status, body: await json<{ annualValue: number; display: string; error?: string }>(res) }
}

export async function approveReview(input: {
  requestId: string
  actor?: string
  keyKind?: 'device-bound' | 'synced' | 'totp'
  pinVerified?: boolean
  approve?: boolean
  reason?: string
  note?: string
  aaguid?: string
  signatureCounter?: number
  cancel?: boolean
  onlyWhatICanApprove?: boolean
  signedPayload?: string
}) {
  const res = await fetchRetry(`${base()}/api/e2e/review/approve`, {
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

export type E2eReviewItem = {
  id: string
  status: string
  args?: { annualValue?: number; before?: number }
}

export async function listReview() {
  const res = await fetchRetry(`${base()}/api/e2e/review`)
  return {
    status: res.status,
    body: await json<{ review: E2eReviewItem[]; badges: Record<string, number> }>(res),
  }
}

export async function control(body: Record<string, unknown>) {
  const res = await fetchRetry(`${base()}/api/e2e/control`, {
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
  const res = await fetchRetry(`${base()}/api/e2e/subscriptions`, {
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
  const res = await fetchRetry(`${base()}/api/e2e/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: input.name, content: input.content, kind: input.kind }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function eraseSubject(
  input:
    | {
        subject: string
        actor?: string
        pinVerified?: boolean
        stopHalfway?: boolean
        resumeJobId?: string
      }
    | {
        resumeJobId: string
        subject?: string
        actor?: string
        pinVerified?: boolean
        stopHalfway?: boolean
      },
) {
  const res = await fetchRetry(`${base()}/api/e2e/erase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function searchErased(q: string) {
  const res = await fetchRetry(`${base()}/api/e2e/erase?q=${encodeURIComponent(q)}`)
  return { status: res.status, body: await json<{ results: unknown[] }>(res) }
}

export async function memorySearch(q: string, opts: Record<string, unknown> = {}) {
  const res = await fetchRetry(`${base()}/api/e2e/memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q, ...opts }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function keysApi(body?: Record<string, unknown>) {
  if (!body) {
    const res = await fetchRetry(`${base()}/api/e2e/keys`)
    return { status: res.status, body: await json<Record<string, unknown>>(res) }
  }
  const res = await fetchRetry(`${base()}/api/e2e/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function listEvents(after?: string) {
  const url = after
    ? `${base()}/events?after=${encodeURIComponent(after)}`
    : `${base()}/events`
  const res = await fetchRetry(url)
  return {
    status: res.status,
    body: await json<{
      events: { id: string; type: string; data?: unknown; time?: string; test?: boolean; inbound?: boolean }[]
      counts24h?: Record<string, number>
      cursor?: string | null
    }>(res),
  }
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
  const res = await fetchRetry(`${base()}/api/e2e/inbound`, {
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
  const res = await fetchRetry(`${base()}/api/e2e/usage`)
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function settingsMutate(input: Record<string, unknown>) {
  const res = await fetchRetry(`${base()}/api/e2e/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function fetchAsOrg(path: string, org: string) {
  const res = await fetchRetry(`${base()}${path}`, { headers: { 'x-org': org } })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function postEvents(input: Record<string, unknown>) {
  const res = await fetchRetry(`${base()}/events`, {
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
  const res = await fetchRetry(`${base()}/api/e2e/stripe/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export type E2eFirstRun = {
  step: number
  total: number
  label: string
  securityKeysRegistered?: boolean
  step3Unlocked?: boolean
  step3DisabledReason?: string | null
  recoveryCodesShownOnce?: boolean
}

export async function getOrg() {
  const res = await fetchRetry(`${base()}/api/e2e/org`)
  return {
    status: res.status,
    body: await json<{
      firstRun: E2eFirstRun
      owner?: string
      ownerCount?: number
      people?: { name: string; role: string; active?: boolean }[]
    }>(res),
  }
}

export async function decisionCall(input: {
  key: string
  site: string
  text?: string
  answer?: string
  actor?: string
  questionType?: string
  skip?: boolean
  askTeammate?: string
  question?: string
}) {
  const res = await fetchRetry(`${base()}/api/e2e/decision`, {
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
  const res = await fetchRetry(`${webhook()}/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reset: true, mode: '200' }),
  })
  return json(res)
}

export async function setWebhookMode(mode: '200' | '503' | '410') {
  const res = await fetchRetry(`${webhook()}/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  return json(res)
}

export async function getWebhookDeliveries() {
  const res = await fetchRetry(`${webhook()}/deliveries`)
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

export async function waitForDeliveries(min = 1, attempts = 25) {
  let deliveries: Awaited<ReturnType<typeof getWebhookDeliveries>>['deliveries'] = []
  for (let i = 0; i < attempts; i++) {
    const d = await getWebhookDeliveries()
    deliveries = d.deliveries
    if (deliveries.length >= min) break
    await new Promise((r) => setTimeout(r, 100))
  }
  return deliveries
}

export async function getConnections() {
  const res = await fetchRetry(`${base()}/api/e2e/connections`)
  return {
    status: res.status,
    body: await json<{
      connections: {
        id: string
        name: string
        groups: string[]
        status: string
        personal?: boolean
        kind?: string
        readOverrides?: string[]
      }[]
    }>(res),
  }
}

export async function getDecisionSites() {
  const res = await fetchRetry(`${base()}/api/e2e/decision`)
  return {
    status: res.status,
    body: await json<{
      sites: Record<string, { count7d: number; mode?: string; labels?: Record<string, number> }>
    }>(res),
  }
}

/** Arrange/fault snapshot (GET /api/e2e/control). Do not use as Pass-when. */
export async function getWitness() {
  const res = await fetchRetry(`${base()}/api/e2e/control`)
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function listSubscriptions() {
  const res = await fetchRetry(`${base()}/api/e2e/subscriptions`)
  return {
    status: res.status,
    body: await json<{ subscriptions: Record<string, unknown>[] }>(res),
  }
}

export async function subscriptionAction(
  action: 'pause' | 'resume' | 'create',
  input: { id?: string; url?: string; events?: string[]; challengeOk?: boolean } = {},
) {
  const res = await fetchRetry(`${base()}/api/e2e/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...input }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function redeliverEvent(redeliverId: string) {
  return postEvents({ redeliverId })
}

export async function retryAllEvents() {
  return postEvents({ retryAll: true })
}

export async function getSettings() {
  const res = await fetchRetry(`${base()}/api/e2e/settings`)
  return {
    status: res.status,
    body: await json<{
      orgName?: string
      signedIn?: boolean
      signedInUserId?: string
      idleTimeoutMinutes?: number
      maxSessionMinutes?: number
      profile?: {
        name: string
        role: string
        active: boolean
        timeZone: string
        appearance: string
        notifications: { slack: boolean; push: boolean }
        sessions: { ended: boolean; device: string; path: string }[]
      } | null
      people?: {
        name: string
        role: string
        active: boolean
        groups?: string[]
        canApproveContracts?: boolean
        timeZone: string
        appearance: string
        notifications: { slack: boolean; push: boolean }
        sessions: { ended: boolean; device: string; path: string }[]
      }[]
      notificationsOutbox?: { channel: string; to: string; body: string }[]
      requestExpiryMinutes?: number
      auditRetentionYears?: number
      requesterCannotApproveLocked?: boolean
    }>(res),
  }
}

export async function getDocuments() {
  const res = await fetchRetry(`${base()}/api/e2e/documents`)
  return { status: res.status, body: await json<{ documents: unknown[] }>(res) }
}

export async function getInboundStats() {
  const res = await fetchRetry(`${base()}/api/e2e/inbound`)
  return { status: res.status, body: await json<{ stats: Record<string, number> }>(res) }
}

export async function systemOne(input: { question?: string; text?: string }) {
  const res = await fetchRetry(`${base()}/api/e2e/v1/systemone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function openaiChatWithIp(
  input: {
    key: string
    messages: { role: string; content: string }[]
    model?: string
  },
  ip: string,
) {
  const res = await fetchRetry(`${base()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.key}`,
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({
      model: input.model ?? 'standard',
      messages: input.messages,
    }),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function memoryGet(q: string, opts: Record<string, string> = {}) {
  const params = new URLSearchParams({ q, ...opts })
  const res = await fetchRetry(`${base()}/api/e2e/memory?${params}`)
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export async function memoryPost(body: Record<string, unknown>, key?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key) headers.authorization = `Bearer ${key}`
  const res = await fetchRetry(`${base()}/api/e2e/memory`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await json<Record<string, unknown>>(res) }
}

export { base as harnessBase, webhook as webhookBase }
