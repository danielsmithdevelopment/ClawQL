'use client'

import { postAnalyticsPageview } from '@/lib/analytics-pageview-client'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'

const SESSION_STORAGE_KEY = 'clawql_analytics_sid'

function readOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.localStorage.setItem(SESSION_STORAGE_KEY, id)
    return id
  } catch {
    return `sess-${Date.now()}`
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

    void postAnalyticsPageview(endpoint, {
      path,
      referrer:
        typeof document !== 'undefined'
          ? document.referrer || undefined
          : undefined,
      sessionId: readOrCreateSessionId(),
      timestamp: new Date().toISOString(),
      properties: {
        site,
        hostname:
          typeof window !== 'undefined' ? window.location.hostname : undefined,
      },
    })
  }, [pathname, searchParams, site])

  return null
}

export function ClawqlAnalyticsPageview(props: ClawqlAnalyticsPageviewProps) {
  return (
    <Suspense fallback={null}>
      <ClawqlAnalyticsPageviewInner {...props} />
    </Suspense>
  )
}
