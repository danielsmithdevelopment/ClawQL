import { NextResponse } from 'next/server'

import { k8sSyncAllowed, k8sSyncAuthOk } from '@/lib/k8s-dashboard-auth'
import { syncSecretAndRestart } from '@/lib/k8s-sync'

export const runtime = 'nodejs'

type Body = {
  namespace?: string
  secretName?: string
  deploymentName?: string
  values?: Record<string, string>
  removeKeys?: string[]
}

export async function POST(req: Request) {
  if (!k8sSyncAllowed()) {
    return NextResponse.json(
      {
        error:
          'Vault sync is disabled. Set CLAWQL_DASHBOARD_ALLOW_K8S_SYNC=1 on the dashboard server process.',
      },
      { status: 403 },
    )
  }
  if (!k8sSyncAuthOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const namespace = (body.namespace ?? process.env.CLAWQL_DASHBOARD_K8S_NAMESPACE ?? 'clawql').trim()
  const secretName = (body.secretName ?? process.env.CLAWQL_DASHBOARD_K8S_SECRET_NAME ?? 'clawql-provider-env').trim()
  const deploymentName = (
    body.deploymentName ?? process.env.CLAWQL_DASHBOARD_K8S_DEPLOYMENT ?? 'clawql-mcp-http'
  ).trim()
  const raw = body.values ?? {}
  const literals: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t !== '') literals[k] = v
  }

  const removeRaw = body.removeKeys
  const removeKeys = Array.isArray(removeRaw)
    ? removeRaw.filter((k): k is string => typeof k === 'string' && k.trim() !== '')
    : []

  if (!namespace || !secretName || !deploymentName) {
    return NextResponse.json({ error: 'namespace, secretName, and deploymentName are required' }, { status: 400 })
  }
  if (Object.keys(literals).length === 0 && removeKeys.length === 0) {
    return NextResponse.json({ error: 'No changes to apply' }, { status: 400 })
  }

  try {
    await syncSecretAndRestart({
      namespace,
      secretName,
      deploymentName,
      literals,
      removeKeys,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'vault sync failed', detail: msg }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
