const base = () => process.env.CLAWQL_CLOUD_E2E_BASE_URL ?? 'http://127.0.0.1:3040'

export type ScenarioApiResult = {
  ok: boolean
  id: string
  details?: unknown
  manual?: boolean
  skipped?: boolean
  error?: string
}

/** Reset the in-process world, then run one catalog scenario via the public harness. */
export async function runScenario(id: string, opts?: { reset?: boolean }): Promise<ScenarioApiResult> {
  if (opts?.reset !== false) {
    const reset = await fetch(`${base()}/api/e2e/reset`, { method: 'POST' })
    if (!reset.ok) throw new Error(`reset failed: ${reset.status}`)
  }
  const res = await fetch(`${base()}/api/e2e/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const body = (await res.json().catch(() => ({}))) as ScenarioApiResult
  return {
    ok: Boolean(body.ok),
    id: body.id ?? id,
    details: body.details,
    manual: body.manual,
    skipped: body.skipped,
    error: body.error ?? (res.ok ? undefined : `HTTP ${res.status}`),
  }
}
