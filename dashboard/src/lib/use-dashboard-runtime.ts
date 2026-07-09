'use client'

import { useEffect, useState } from 'react'

export type DashboardRuntime = {
  desktopMode: boolean
  vaultRoot: string
  providersVaultPath: string | null
  providersLoadUrl: string
  providersSaveUrl: string
  openclawConfigured: boolean
  chatStream: boolean
}

export function useDashboardRuntime(): DashboardRuntime | null {
  const [runtime, setRuntime] = useState<DashboardRuntime | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/runtime/dashboard')
      .then((r) => r.json())
      .then((body: DashboardRuntime) => {
        if (!cancelled) setRuntime(body)
      })
      .catch(() => {
        if (!cancelled) setRuntime(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return runtime
}
