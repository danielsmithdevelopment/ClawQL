'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { issueManagedKey } from '@/lib/managed/client'
import { GATEWAY_BASE, type ApiKeyItem } from '@/lib/managed/fixtures'
import { cn } from '@/lib/utils'

const CAPABILITIES = [
  { id: 'models', label: 'Models', path: '/v1', scopes: ['inference', 'models'] },
  { id: 'tools', label: 'Tools', path: '/mcp', scopes: ['execute', 'search'] },
  { id: 'memory', label: 'Memory', path: '/memory', scopes: ['memory'] },
  { id: 'decisions', label: 'Decisions', path: '/decision', scopes: ['decision'] },
  { id: 'events', label: 'Events', path: '/events', scopes: ['events'] },
] as const

type Phase = 'create' | 'created'

function scopesFromCaps(caps: Record<string, boolean>): string[] {
  const scopes = new Set<string>()
  for (const cap of CAPABILITIES) {
    if (!caps[cap.id]) continue
    for (const s of cap.scopes) scopes.add(s)
  }
  return [...scopes]
}

export function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (key: ApiKeyItem) => void
}) {
  const [phase, setPhase] = useState<Phase>('create')
  const [name, setName] = useState('billing-sync')
  const [caps, setCaps] = useState<Record<string, boolean>>({
    models: true,
    tools: true,
    memory: false,
    decisions: false,
    events: false,
  })
  const [dailyCap, setDailyCap] = useState('50')
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ key: ApiKeyItem; secret: string } | null>(null)

  if (!open) return null

  const resetAndClose = () => {
    setPhase('create')
    setSaved(false)
    setError(null)
    setIssued(null)
    setSubmitting(false)
    onClose()
  }

  const secret = issued?.secret ?? ''
  const createdKey = issued?.key

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-key-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        {phase === 'create' ? (
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="create-key-title" className="text-xl font-semibold text-slate-900">
                  Create a key
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  For a client or service that talks to your gateway. Each key gets only what it needs.
                </p>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={resetAndClose}>
                ✕
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-800">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-slate-800">What it can use</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CAPABILITIES.map((cap) => (
                  <label
                    key={cap.id}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors',
                      caps[cap.id]
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={Boolean(caps[cap.id])}
                      onChange={(e) => setCaps((prev) => ({ ...prev, [cap.id]: e.target.checked }))}
                    />
                    <span className="font-medium">{cap.label}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{cap.path}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 block text-sm font-medium text-slate-800">
              Daily cap
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <input
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  className="h-9 w-28 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Soft UI limit for now — enforcement lands with metering. Requests stop until midnight UTC once
                it&apos;s reached.
              </p>
            </label>

            <p className="mt-5 text-xs text-slate-500">
              Creating a key needs your security key. We store only a hash, so you&apos;ll see the key once.
            </p>
            {error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetAndClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting || !name.trim()}
                onClick={() => {
                  setSubmitting(true)
                  setError(null)
                  void issueManagedKey({
                    name: name.trim() || 'unnamed',
                    scope: scopesFromCaps(caps),
                  })
                    .then((res) => {
                      const withCap: ApiKeyItem = {
                        ...res.key,
                        dailyCap: `$${dailyCap || '0'}`,
                      }
                      setIssued({ key: withCap, secret: res.secret })
                      onCreated?.(withCap)
                      setPhase('created')
                    })
                    .catch((e: unknown) => {
                      setError(e instanceof Error ? e.message : String(e))
                    })
                    .finally(() => setSubmitting(false))
                }}
              >
                {submitting ? 'Creating…' : 'Create with security key'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                ✓
              </span>
              <div>
                <h2 id="create-key-title" className="text-xl font-semibold text-slate-900">
                  Key created: {createdKey?.name || name || 'unnamed'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Issued via IssuedApiKeyStore. Copy the secret now — it won&apos;t be shown again.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <strong>Copy it now.</strong> We keep only a hash of this key, so it can&apos;t be shown again. If you
              lose it, revoke it and create a new one.
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-800">
              Your key
              <div className="mt-1.5 flex gap-2">
                <input
                  readOnly
                  value={secret}
                  data-testid="created-key-secret"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs"
                />
                <Button type="button" onClick={() => void navigator.clipboard?.writeText(secret)}>
                  Copy
                </Button>
              </div>
            </label>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-800">Use it</p>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {`OPENAI_BASE_URL=${GATEWAY_BASE}/v1\nOPENAI_API_KEY=${secret.slice(0, 14)}...${secret.slice(-3)}`}
              </pre>
              <p className="mt-2 text-xs text-slate-500">
                For an MCP client, use the same key with <code className="font-mono">clawql mcp-config</code>.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ['Can use', createdKey?.canUse ?? '—'],
                ['Key group', createdKey?.keyGroup ?? 'Default'],
                ['Daily cap', createdKey?.dailyCap ?? `$${dailyCap || '0'}`],
                ['Expires', createdKey?.expiresLabel ?? 'No expiry'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">{k}</p>
                  <p className="font-medium text-slate-800">{v}</p>
                </div>
              ))}
            </div>

            <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              I&apos;ve saved this key somewhere safe.
            </label>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Recorded against org keys under <span className="font-mono text-sky-700">$CLAWQL_HOME</span>.
              </p>
              <Button type="button" disabled={!saved} onClick={resetAndClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
