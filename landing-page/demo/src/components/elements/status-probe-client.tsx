'use client'

import { useEffect, useState } from 'react'
import { gatewayUrl, site } from '@/lib/site'

type StatusPayload = {
  ok?: boolean
  service?: string
  profile?: string
  time?: string
  components?: Record<string, boolean>
  policy?: { mcp_executions?: string; worker_side_meter?: boolean }
  error?: string
}

export function StatusProbeClient() {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [httpStatus, setHttpStatus] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${gatewayUrl}/status`, { cache: 'no-store' })
        if (cancelled) return
        setHttpStatus(res.status)
        if (!res.ok) {
          setError(`HTTP ${res.status}`)
          setStatus({ ok: false })
          return
        }
        setStatus((await res.json()) as StatusPayload)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus({ ok: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const components = status?.components ?? {}

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-md border border-mist-200 bg-white p-6">
        <p className="text-sm text-mist-600">Gateway</p>
        <p className="text-xl font-semibold text-mist-950">{gatewayUrl}</p>
        <p className="mt-2 text-sm text-mist-700">
          {error
            ? `Unreachable: ${error}`
            : status?.ok
              ? `Operational · ${status.service ?? 'clawql-gateway'} · ${status.profile ?? 'edge'}`
              : httpStatus
                ? `HTTP ${httpStatus}`
                : 'Checking…'}
        </p>
        {status?.time ? (
          <p className="mt-1 text-xs text-mist-500">Reported at {status.time}</p>
        ) : null}
      </div>

      <ul className="space-y-2">
        {Object.entries(components).map(([name, up]) => (
          <li
            key={name}
            className="flex items-center justify-between border-b border-mist-100 py-2 text-sm"
          >
            <span className="font-medium text-mist-900">{name}</span>
            <span className={up ? 'text-emerald-700' : 'text-mist-500'}>
              {up ? 'configured' : 'not bound'}
            </span>
          </li>
        ))}
      </ul>

      <div className="text-sm text-mist-700">
        <p>
          Policy:{' '}
          <strong>{status?.policy?.mcp_executions ?? 'unlimited'} MCP executions</strong>
          {status?.policy?.worker_side_meter === false
            ? ' · no Worker-side meter'
            : null}
        </p>
        <p className="mt-2">
          Incident updates and deeper component history will land here as the hosted fleet grows.
          Contact{' '}
          <a className="underline" href={site.urls.contact}>
            hello@clawql.com
          </a>
          .
        </p>
      </div>
    </div>
  )
}
