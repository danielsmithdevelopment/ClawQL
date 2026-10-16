'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'

export function SupportViewAsButton({
  targetUserId,
  targetEmail,
  targetDisplayName,
}: {
  targetUserId: string
  targetEmail: string
  targetDisplayName: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        data-testid={`support-view-as-${targetUserId}`}
        onClick={() => {
          const reason = window.prompt(
            `Reason for viewing as ${targetDisplayName} (written to Audit — required):`,
            'Support ticket: '
          )
          if (!reason) return
          setBusy(true)
          setError(null)
          void fetch('/api/managed/support/impersonation', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'start',
              targetUserId,
              targetEmail,
              targetDisplayName,
              reason,
            }),
          })
            .then(async (r) => {
              const j = (await r.json()) as { error?: string }
              if (!r.ok) {
                setError(j.error ?? 'Failed to start support view')
                return
              }
              window.location.reload()
            })
            .catch(() => setError('Network error'))
            .finally(() => setBusy(false))
        }}
      >
        View as
      </Button>
      {error ? <span className="text-[11px] text-rose-700">{error}</span> : null}
    </div>
  )
}
