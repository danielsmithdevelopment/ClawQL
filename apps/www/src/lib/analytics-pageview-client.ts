/**
 * Client pageview POST helper (browser-safe, no server deps).
 */

export type AnalyticsPageviewPayload = {
  path: string
  referrer?: string
  sessionId: string
  timestamp: string
  properties?: Record<string, unknown>
}

export function shouldLogAnalyticsClientFailures(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_CLAWQL_ANALYTICS_DEBUG === '1'
  )
}

export function warnAnalyticsClientFailure(
  context: string,
  detail: { status?: number; reason?: string; error?: unknown },
): void {
  if (!shouldLogAnalyticsClientFailures()) return
  const parts = [context]
  if (detail.status !== undefined) parts.push(`status=${detail.status}`)
  if (detail.reason) parts.push(`reason=${detail.reason}`)
  console.warn(`[clawql-analytics] ${parts.join(' ')}`, detail.error ?? '')
}

export async function postAnalyticsPageview(
  endpoint: string,
  payload: AnalyticsPageviewPayload,
): Promise<void> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: 'cors',
    })

    if (!response.ok) {
      let reason: string | undefined
      try {
        const json = (await response.json()) as { reason?: string }
        reason = json.reason
      } catch {
        /* ignore */
      }
      warnAnalyticsClientFailure('pageview collector rejected request', {
        status: response.status,
        reason,
      })
    }
  } catch (error) {
    warnAnalyticsClientFailure(
      'pageview POST failed (network, CORS, or ad/privacy blocker)',
      { error },
    )
  }
}
