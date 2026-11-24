'use client'

import { postAnalyticsPageview } from '@/lib/analytics-pageview-client'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'

const SESSION_STORAGE_KEY = 'clawql_analytics_sid'
const CONSENT_STORAGE_KEY = 'clawql_analytics_consent'

/** Pseudonymous ID only after explicit consent (`localStorage` flag). */
function readConsentedSessionId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    if (window.localStorage.getItem(CONSENT_STORAGE_KEY) !== '1') return undefined
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.localStorage.setItem(SESSION_STORAGE_KEY, id)
    return id
  } catch {
    return undefined
  }
}

type ClawqlAnalyticsPageviewProps = {
  site: 'docs' | 'marketing'
}

function ClawqlAnalyticsPageviewInner({ site }: ClawqlAnalyticsPageviewProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CLAWQL_ANALYTICS_ENABLED !== '1') return

    const query = searchParams?.toString()
    const path = `${pathname}${query ? `?${query}` : ''}`
    if (lastPath.current === path) return
    lastPath.current = path

    const defaultEndpoint =
      site === 'docs'
        ? '/api/analytics/pageview'
        : 'https://docs.clawql.com/api/analytics/pageview'
    const endpoint =
      process.env.NEXT_PUBLIC_CLAWQL_ANALYTICS_ENDPOINT ?? defaultEndpoint

    const sessionId = readConsentedSessionId()

    void postAnalyticsPageview(endpoint, {
      path,
      referrer:
        typeof document !== 'undefined'
          ? document.referrer || undefined
          : undefined,
      ...(sessionId ? { sessionId } : {}),
      timestamp: new Date().toISOString(),
      properties: {
        site,
        hostname:
          typeof window !== 'undefined' ? window.location.hostname : undefined,
        identity: sessionId ? 'pseudonymous' : 'anonymous_no_id',
      },
    })
  }, [pathname, searchParams, site])

  return null
}

/** Fires pageviews through clawql-analytics. Persistent IDs are pseudonymous and consent-gated. */
export function ClawqlAnalyticsPageview(props: ClawqlAnalyticsPageviewProps) {
  return (
    <Suspense fallback={null}>
      <ClawqlAnalyticsPageviewInner {...props} />
    </Suspense>
  )
}
