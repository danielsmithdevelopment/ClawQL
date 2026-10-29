/**
 * Next.js App Router uses `?_rsc=` (sometimes `?rsc=`) for React Server Component
 * flight / prefetch requests. Real browsers always send `RSC: 1`.
 *
 * Bots and scrapers often replay those URLs without the header. Next then falls
 * back to full HTML for a flight URL — expensive on Cloudflare Workers and a
 * common free-plan quota / Error 1102 amplifier.
 */

export const RSC_QUERY_KEYS = ['_rsc', 'rsc'] as const

export type RscGuardDecision =
  | { action: 'allow' }
  | { action: 'reject'; reason: 'rsc_query_without_rsc_header' }

export function hasRscFlightQuery(
  searchParams: Pick<URLSearchParams, 'has'>,
): boolean {
  return RSC_QUERY_KEYS.some((key) => searchParams.has(key))
}

/** True when the request looks like a real Next.js RSC flight/prefetch. */
export function hasLegitimateRscHeader(headers: Pick<Headers, 'get'>): boolean {
  return headers.get('rsc') === '1'
}

export function decideRscBotGuard(input: {
  searchParams: Pick<URLSearchParams, 'has'>
  headers: Pick<Headers, 'get'>
}): RscGuardDecision {
  if (!hasRscFlightQuery(input.searchParams)) {
    return { action: 'allow' }
  }
  if (hasLegitimateRscHeader(input.headers)) {
    return { action: 'allow' }
  }
  return { action: 'reject', reason: 'rsc_query_without_rsc_header' }
}

/** Drop flight query keys; keep unrelated params (utm, etc.). */
export function stripRscFlightQuery(url: URL): URL {
  const cleaned = new URL(url)
  for (const key of RSC_QUERY_KEYS) {
    cleaned.searchParams.delete(key)
  }
  return cleaned
}
