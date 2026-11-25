import { NextResponse } from 'next/server'

import { assertApiHostAllowed } from '@/lib/api-auth'
import { k8sSyncAllowed, k8sSyncAuthOk } from '@/lib/k8s-dashboard-auth'
import { readSecretData } from '@/lib/k8s-sync'

export const runtime = 'nodejs'

function configuredVaultTarget(): { namespace: string; secretName: string } {
  return {
    namespace: (process.env.CLAWQL_DASHBOARD_K8S_NAMESPACE ?? 'clawql').trim(),
    secretName: (process.env.CLAWQL_DASHBOARD_K8S_SECRET_NAME ?? 'clawql-provider-env').trim(),
  }
}

export async function GET(req: Request) {
  const hostDenied = assertApiHostAllowed(req)
  if (hostDenied) return hostDenied

  if (!k8sSyncAllowed()) {
    return NextResponse.json(
      {
        error:
          'Vault read is disabled. Set CLAWQL_DASHBOARD_ALLOW_K8S_SYNC=1 on the dashboard server process.',
      },
      { status: 403 },
    )
  }
  if (!k8sSyncAuthOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Namespace / secret name come from server config only (audit 8.05).
  const { namespace, secretName } = configuredVaultTarget()
  if (!namespace || !secretName) {
    return NextResponse.json({ error: 'namespace and secretName are required' }, { status: 400 })
  }

  let data: Record<string, string> | null
  try {
    data = await readSecretData(namespace, secretName)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'vault read failed', detail: msg }, { status: 502 })
  }

  return NextResponse.json({
    values: data ?? {},
    found: data !== null,
  })
}
