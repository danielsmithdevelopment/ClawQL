'use client'

import { useCallback, useEffect, useMemo, useState, type ClipboardEvent, type FormEvent } from 'react'

import type { EnvCatalog } from '@/lib/env-catalog'

function defaultNs(): string {
  return process.env.NEXT_PUBLIC_CLAWQL_DASHBOARD_K8S_NAMESPACE ?? 'clawql'
}

function defaultSecret(): string {
  return process.env.NEXT_PUBLIC_CLAWQL_DASHBOARD_K8S_SECRET_NAME ?? 'clawql-provider-env'
}

function defaultDeploy(): string {
  return process.env.NEXT_PUBLIC_CLAWQL_DASHBOARD_K8S_DEPLOYMENT ?? 'clawql-mcp-http'
}

function parseDotenvLikeText(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  const lines = raw.split(/\r?\n/)

  for (const originalLine of lines) {
    let line = originalLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice('export '.length).trim()

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    parsed[key] = value
  }

  return parsed
}

function RevealToggle({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={revealed}
      aria-label={revealed ? 'Hide value' : 'Show value'}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-300 dark:hover:bg-white/5"
    >
      {revealed ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

export function EnvForm({ catalog }: { catalog: EnvCatalog }) {
  const catalogKeys = useMemo(
    () => catalog.sections.flatMap((s) => s.keys.map((e) => e.key)),
    [catalog.sections],
  )

  const initialValues = useMemo(() => {
    const m: Record<string, string> = {}
    for (const k of catalogKeys) m[k] = ''
    return m
  }, [catalogKeys])

  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [vaultBaseline, setVaultBaseline] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const k of catalogKeys) m[k] = ''
    return m
  })
  const [filter, setFilter] = useState('')
  const [syncToken, setSyncToken] = useState('')
  const [namespace, setNamespace] = useState(defaultNs)
  const [secretName, setSecretName] = useState(defaultSecret)
  const [deploymentName, setDeploymentName] = useState(defaultDeploy)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [health, setHealth] = useState<{ kubectl: boolean; syncAllowed: boolean } | null>(
    null,
  )
  const [loadingVault, setLoadingVault] = useState(false)
  const [vaultHydrated, setVaultHydrated] = useState(false)
  const [vaultLoadMessage, setVaultLoadMessage] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [vaultReloadNonce, setVaultReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/k8s/health')
      .then((r) => r.json())
      .then((body: { kubectl?: boolean; syncAllowed?: boolean }) => {
        if (cancelled) return
        setHealth({
          kubectl: Boolean(body.kubectl),
          syncAllowed: Boolean(body.syncAllowed),
        })
      })
      .catch(() => {
        if (!cancelled) setHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => {
      void (async () => {
        setVaultHydrated(false)
        setLoadingVault(true)
        setVaultLoadMessage(null)
        setRevealed({})
        try {
          const headers: Record<string, string> = {}
          if (syncToken.trim() !== '') {
            headers.Authorization = `Bearer ${syncToken.trim()}`
          }
          const res = await fetch(
            `/api/k8s/secret-env?namespace=${encodeURIComponent(namespace)}&secretName=${encodeURIComponent(secretName)}`,
            { headers, signal: ac.signal },
          )
          const body = (await res.json().catch(() => ({}))) as {
            values?: Record<string, string>
            error?: string
            detail?: string
          }
          if (ac.signal.aborted) return
          if (!res.ok) {
            setVaultLoadMessage(body.error ?? body.detail ?? res.statusText)
            setValues({ ...initialValues })
            setVaultBaseline(Object.fromEntries(catalogKeys.map((k) => [k, ''])))
            return
          }
          const vault = body.values ?? {}
          const next: Record<string, string> = { ...initialValues }
          for (const k of catalogKeys) {
            if (Object.prototype.hasOwnProperty.call(vault, k)) next[k] = vault[k] ?? ''
          }
          setValues(next)
          const base: Record<string, string> = {}
          for (const k of catalogKeys) base[k] = next[k] ?? ''
          setVaultBaseline(base)
        } catch (e) {
          if (ac.signal.aborted) return
          setVaultLoadMessage(e instanceof Error ? e.message : 'Failed to load Vault values')
          setValues({ ...initialValues })
          setVaultBaseline(Object.fromEntries(catalogKeys.map((k) => [k, ''])))
        } finally {
          if (!ac.signal.aborted) {
            setLoadingVault(false)
            setVaultHydrated(true)
          }
        }
      })()
    }, 400)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [namespace, secretName, syncToken, catalogKeys, initialValues, vaultReloadNonce])

  const onChange = useCallback((key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }))
  }, [])

  const onPasteEnvBlob = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text')
      if (!text || (!text.includes('\n') && !text.includes('\r') && !text.includes('export '))) return
      if (!text.includes('=')) return

      const parsed = parseDotenvLikeText(text)
      const entries = Object.entries(parsed).filter(([k]) => catalogKeys.includes(k))
      if (entries.length === 0) return

      e.preventDefault()
      setValues((prev) => {
        const next = { ...prev }
        for (const [k, v] of entries) next[k] = v
        return next
      })
      setStatus('idle')
      setMessage(`Imported ${entries.length} value${entries.length === 1 ? '' : 's'} from pasted .env text.`)
    },
    [catalogKeys],
  )

  const toggleReveal = useCallback((key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setStatus('loading')
      setMessage(null)

      const literals: Record<string, string> = {}
      const removeKeys: string[] = []
      for (const k of catalogKeys) {
        const cur = values[k] ?? ''
        const base = vaultBaseline[k] ?? ''
        const trimmed = cur.trim()
        if (trimmed === '') {
          if (base !== '') removeKeys.push(k)
        } else if (cur !== base) {
          literals[k] = cur
        }
      }

      if (Object.keys(literals).length === 0 && removeKeys.length === 0) {
        setStatus('idle')
        setMessage('No changes to save compared to the loaded Vault values.')
        return
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (syncToken.trim() !== '') {
        headers.Authorization = `Bearer ${syncToken.trim()}`
      }
      try {
        const res = await fetch('/api/k8s/sync-secret', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            namespace,
            secretName,
            deploymentName,
            values: literals,
            removeKeys,
          }),
        })
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
        if (!res.ok) {
          setStatus('err')
          setMessage(body.error ?? body.detail ?? res.statusText)
          return
        }
        setStatus('ok')
        setMessage('Vault updated and rollout restarted.')

        setVaultHydrated(false)
        setLoadingVault(true)
        setVaultLoadMessage(null)
        try {
          const h: Record<string, string> = {}
          if (syncToken.trim() !== '') h.Authorization = `Bearer ${syncToken.trim()}`
          const r2 = await fetch(
            `/api/k8s/secret-env?namespace=${encodeURIComponent(namespace)}&secretName=${encodeURIComponent(secretName)}`,
            { headers: h },
          )
          const b2 = (await r2.json().catch(() => ({}))) as { values?: Record<string, string>; error?: string }
          if (r2.ok) {
            const vault = b2.values ?? {}
            const next: Record<string, string> = { ...initialValues }
            for (const k of catalogKeys) {
              if (Object.prototype.hasOwnProperty.call(vault, k)) next[k] = vault[k] ?? ''
            }
            setValues(next)
            const base: Record<string, string> = {}
            for (const k of catalogKeys) base[k] = next[k] ?? ''
            setVaultBaseline(base)
            setRevealed({})
          }
        } finally {
          setLoadingVault(false)
          setVaultHydrated(true)
        }
      } catch (err) {
        setStatus('err')
        setMessage(err instanceof Error ? err.message : 'Request failed')
      }
    },
    [values, vaultBaseline, namespace, secretName, deploymentName, syncToken, catalogKeys, initialValues],
  )

  const q = filter.trim().toLowerCase()

  return (
    <form
      data-vault-hydrated={vaultHydrated ? 'true' : 'false'}
      onSubmit={onSubmit}
      className="space-y-8"
    >
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-claw-panel sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Cluster targets</h2>
        {health ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span
              className={
                health.kubectl ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }
            >
              kubectl {health.kubectl ? 'available' : 'not found / not on PATH'}
            </span>
            {' · '}
            <span
              className={
                health.syncAllowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }
            >
              sync API {health.syncAllowed ? 'enabled' : 'disabled (set CLAWQL_DASHBOARD_ALLOW_K8S_SYNC=1)'}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Checking server / kubectl…</p>
        )}
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Uses your local <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">kubectl</code> context unless{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">KUBE_CONTEXT</code> is set for this process.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Namespace
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-claw-cyan/40 focus:ring-2 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-100"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Secret name
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-claw-cyan/40 focus:ring-2 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-100"
              value={secretName}
              onChange={(e) => setSecretName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Deployment
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-claw-cyan/40 focus:ring-2 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-100"
              value={deploymentName}
              onChange={(e) => setDeploymentName(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <label className="mt-4 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Sync bearer token (optional — required when{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">CLAWQL_DASHBOARD_SYNC_TOKEN</code> is set)
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-claw-cyan/40 focus:ring-2 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-100"
            value={syncToken}
            onChange={(e) => setSyncToken(e.target.value)}
            autoComplete="off"
            placeholder="Paste token if the API enforces Authorization"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          {loadingVault ? <span>Loading values from Vault…</span> : <span>Values pre-filled from Vault when read is allowed.</span>}
          <button
            type="button"
            onClick={() => {
              setVaultLoadMessage(null)
              setVaultReloadNonce((n) => n + 1)
            }}
            className="rounded-md font-medium text-claw-terra underline-offset-2 hover:underline dark:text-claw-cyan"
          >
            Reload from Vault
          </button>
        </div>
        {vaultLoadMessage ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="alert">
            {vaultLoadMessage}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block flex-1 text-sm text-zinc-600 dark:text-zinc-400">
          Filter keys
          <input
            type="search"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-claw-cyan/40 focus:ring-2 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-100 sm:max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Substring match on variable name"
            disabled={loadingVault}
          />
        </label>
        <button
          type="submit"
          disabled={status === 'loading' || loadingVault || !vaultHydrated}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-claw-terra px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-claw-terra/90 disabled:opacity-50 dark:ring-1 dark:ring-white/10"
        >
          {status === 'loading' ? 'Saving…' : 'Save to Vault & restart rollout'}
        </button>
      </div>

      {message ? (
        <p
          className={
            status === 'ok'
              ? 'text-sm text-emerald-600 dark:text-emerald-400'
              : status === 'err'
                ? 'text-sm text-red-600 dark:text-red-400'
                : 'text-sm text-zinc-600 dark:text-zinc-400'
          }
          role="status"
        >
          {message}
        </p>
      ) : null}

      {catalog.sections.map((section) => {
        const keys = section.keys.filter((k) =>
          q === '' ? true : k.key.toLowerCase().includes(q),
        )
        if (keys.length === 0) return null
        return (
          <details
            key={section.title}
            open
            className="group rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-claw-panel"
          >
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-900 marker:content-none dark:text-white sm:px-6 [&::-webkit-details-marker]:hidden">
              {section.title}{' '}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">({keys.length})</span>
            </summary>
            <div className="border-t border-zinc-100 px-4 py-4 dark:border-white/10 sm:px-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {keys.map(({ key, sensitive }) => (
                  <div key={key} className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{key}</span>
                    <div className="mt-1 flex gap-1.5">
                      <input
                        type={sensitive && !revealed[key] ? 'password' : 'text'}
                        data-testid={`env-field-${key}`}
                        disabled={loadingVault}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none ring-claw-cyan/40 focus:ring-2 disabled:opacity-60 dark:border-white/20 dark:bg-claw-bg dark:text-zinc-100"
                        value={values[key] ?? ''}
                        onChange={(e) => onChange(key, e.target.value)}
                        onPaste={onPasteEnvBlob}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Leave blank to skip"
                      />
                      {sensitive ? (
                        <RevealToggle revealed={Boolean(revealed[key])} onToggle={() => toggleReveal(key)} />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )
      })}
    </form>
  )
}
