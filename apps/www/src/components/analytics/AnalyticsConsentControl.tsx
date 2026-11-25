'use client'

import { hasAnalyticsConsent, setAnalyticsConsent } from '@/components/analytics/ClawqlAnalyticsPageview'
import { useEffect, useState } from 'react'

/** Minimal consent control for marketing-site pageviews (privacy policy / footer). */
export function AnalyticsConsentControl() {
  const [consented, setConsented] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setConsented(hasAnalyticsConsent())
    setReady(true)
  }, [])

  if (!ready) return null

  return (
    <p className="mt-4 text-sm/7">
      Marketing-site pageviews (path, referrer, hostname) with a pseudonymous session ID are{' '}
      <strong>{consented ? 'on' : 'off'}</strong>. Self-hosted ClawQL does not phone home.
      <button
        type="button"
        className="ml-2 underline"
        onClick={() => {
          const next = !consented
          setAnalyticsConsent(next)
          setConsented(next)
        }}
      >
        {consented ? 'Turn off analytics' : 'Allow analytics'}
      </button>
    </p>
  )
}
