'use client'

import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

type ImpersonationState = {
  active: null | {
    id: string
    targetEmail: string
    targetDisplayName: string
    actorEmail: string
    reason: string
    startedAt: string
  }
}

export function SupportImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/managed/support/impersonation')
      if (!r.ok) return
      const j = (await r.json()) as ImpersonationState
      setState(j)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!state?.active) return null

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
      data-testid="support-impersonation-banner"
      role="status"
    >
      <p>
        <span className="font-semibold">Support view:</span> you ({state.active.actorEmail}) are
        viewing as <span className="font-semibold">{state.active.targetDisplayName}</span> (
        {state.active.targetEmail}). Reason recorded in Audit:{' '}
        <span className="italic">{state.active.reason}</span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        data-testid="support-impersonation-stop"
        onClick={() => {
          setBusy(true)
          void fetch('/api/managed/support/impersonation', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'stop' }),
          })
            .then(() => refresh())
            .finally(() => setBusy(false))
        }}
      >
        End support view
      </Button>
    </div>
  )
}
