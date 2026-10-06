const base = () => process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040'

export async function resetWorld() {
  const res = await fetch(`${base()}/api/e2e/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`reset failed: ${res.status}`)
  return res.json()
}

export async function getAudit() {
  const res = await fetch(`${base()}/api/e2e/audit`)
  if (!res.ok) throw new Error(`audit failed: ${res.status}`)
  return res.json() as Promise<{
    entries: { id: string; actor: string; action: string; outcome: string }[]
    chain: { ok: boolean; entries: number }
  }>
}

export async function getCrm(contractId: string) {
  const res = await fetch(`${base()}/api/e2e/crm/${contractId}`)
  if (!res.ok) throw new Error(`crm failed: ${res.status}`)
  return res.json() as Promise<{ annualValue: number; display: string }>
}

export async function approveReview(input: {
  requestId: string
  actor?: string
  keyKind?: 'device-bound' | 'synced'
  pinVerified?: boolean
  approve?: boolean
  reason?: string
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
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

export async function control(body: Record<string, unknown>) {
  const res = await fetch(`${base()}/api/e2e/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

export async function createSubscription(url: string, events: string[] = ['document.processed']) {
  const res = await fetch(`${base()}/api/e2e/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, events }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
