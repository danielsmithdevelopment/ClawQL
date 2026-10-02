'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plug, Trash2 } from 'lucide-react'

import { useDashboardRuntime } from '@/lib/use-dashboard-runtime'

import type { LocalCustomSourceEntry, LocalCustomSourceKind } from '@/lib/custom-sources-types'

const KIND_OPTIONS: { value: '' | LocalCustomSourceKind; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'openapi', label: 'OpenAPI' },
  { value: 'discovery', label: 'Google Discovery' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'grpc', label: 'gRPC (.proto)' },
  { value: 'mcp', label: 'MCP (HTTP)' },
  { value: 'cli', label: 'CLI command' },
]

function kindBadgeClass(kind: LocalCustomSourceKind): string {
  switch (kind) {
    case 'openapi':
      return 'bg-sky-500/15 text-sky-300'
    case 'discovery':
      return 'bg-violet-500/15 text-violet-300'
    case 'graphql':
      return 'bg-pink-500/15 text-pink-300'
    case 'grpc':
      return 'bg-amber-500/15 text-amber-300'
    case 'mcp':
      return 'bg-emerald-500/15 text-emerald-300'
    case 'cli':
      return 'bg-orange-500/15 text-orange-300'
    default:
      return 'bg-zinc-500/15 text-zinc-300'
  }
}

function sourceLocation(entry: LocalCustomSourceEntry): string {
  return (
    entry.url ??
    entry.mcpUrl ??
    entry.cliCommand ??
    entry.graphqlEndpoint ??
    entry.cachePath ??
    '—'
  )
}

export function CustomSourcesForm() {
  const runtime = useDashboardRuntime()
  const desktopMode = runtime?.desktopMode ?? false

  const [sources, setSources] = useState<LocalCustomSourceEntry[]>([])
  const [sourcesPath, setSourcesPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [addMode, setAddMode] = useState<'url' | 'cli'>('url')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'' | LocalCustomSourceKind>('')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    if (!desktopMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/local/sources')
      const body = (await res.json().catch(() => ({}))) as {
        sources?: LocalCustomSourceEntry[]
        sourcesPath?: string
        error?: string
      }
      if (!res.ok) {
        setLoadError(body.error ?? res.statusText)
        setSources([])
        return
      }
      setSources(body.sources ?? [])
      setSourcesPath(body.sourcesPath ?? null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load sources')
      setSources([])
    } finally {
      setLoading(false)
    }
  }, [desktopMode])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!desktopMode) return
    setSaving(true)
    setStatus('idle')
    setMessage(null)
    try {
      const payload =
        addMode === 'cli'
          ? {
              command: command.trim(),
              name: name.trim() || undefined,
              kind: 'cli' as const,
              args: argsText
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean),
            }
          : {
              url: url.trim(),
              name: name.trim() || undefined,
              kind: kind || undefined,
            }

      const res = await fetch('/api/local/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; entry?: LocalCustomSourceEntry }
      if (!res.ok) {
        setStatus('err')
        setMessage(body.error ?? res.statusText)
        return
      }
      setStatus('ok')
      setMessage(
        `Added "${body.entry?.name ?? body.entry?.id}". Restart MCP clients (or clawql-mcp) to index the new source.`,
      )
      setUrl('')
      setName('')
      setCommand('')
      setArgsText('')
      setKind('')
      await loadSources()
    } catch (err) {
      setStatus('err')
      setMessage(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const onRemove = async (id: string) => {
    if (!desktopMode) return
    setMessage(null)
    try {
      const res = await fetch(`/api/local/sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setStatus('err')
        setMessage(body.error ?? res.statusText)
        return
      }
      setStatus('ok')
      setMessage(`Removed source "${id}". Restart MCP to drop it from search/execute.`)
      await loadSources()
    } catch (err) {
      setStatus('err')
      setMessage(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (!desktopMode) {
    return (
      <section className="rounded-xl border border-white/10 bg-claw-panel p-6">
        <p className="text-sm text-zinc-400">
          Custom sources are available in <strong className="text-zinc-200">ClawQL Desktop</strong> (local MCP).
          Use <code className="rounded bg-white/10 px-1">clawql sources add &lt;url&gt;</code> from the CLI in cluster
          deployments.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-white/10 bg-claw-panel p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Plug className="mt-0.5 size-5 shrink-0 text-orange-400" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-white">Custom integrations</h3>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Add OpenAPI, Discovery, GraphQL, gRPC, MCP, or CLI sources from a URL — same as{' '}
              <code className="rounded bg-white/10 px-1">clawql sources add</code>. Saved to{' '}
              <code className="rounded bg-white/10 px-1">
                {sourcesPath ?? runtime?.sourcesFilePath ?? '~/.ClawQL/sources.json'}
              </code>
              .
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-xs text-zinc-500">Loading sources…</p>
        ) : loadError ? (
          <p className="mt-4 text-xs text-amber-400" role="alert">
            {loadError}
          </p>
        ) : sources.length === 0 ? (
          <p className="mt-4 text-xs text-zinc-500">No custom sources yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5 rounded-lg border border-white/10">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-100">{s.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${kindBadgeClass(s.kind)}`}
                    >
                      {s.kind}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">{s.id}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-500">{sourceLocation(s)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRemove(s.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                  aria-label={`Remove ${s.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => void loadSources()}
          className="mt-3 text-xs font-medium text-claw-cyan underline-offset-2 hover:underline"
        >
          Reload list
        </button>
      </section>

      <section className="rounded-xl border border-white/10 bg-claw-panel p-4 sm:p-6">
        <h3 className="text-base font-semibold text-white">Add source</h3>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setAddMode('url')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              addMode === 'url' ? 'bg-orange-500/20 text-orange-300' : 'text-zinc-400 hover:bg-white/5'
            }`}
          >
            From URL
          </button>
          <button
            type="button"
            onClick={() => setAddMode('cli')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              addMode === 'cli' ? 'bg-orange-500/20 text-orange-300' : 'text-zinc-400 hover:bg-white/5'
            }`}
          >
            CLI command
          </button>
        </div>

        <form onSubmit={(e) => void onAdd(e)} className="mt-4 space-y-4">
          {addMode === 'url' ? (
            <>
              <label className="block text-xs font-medium text-zinc-300">
                Spec URL
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/openapi.json"
                  className="mt-1.5 w-full rounded-lg border border-white/20 bg-claw-bg px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-claw-cyan/40 focus:ring-2"
                  disabled={saving}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Display name (optional)
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My API"
                    className="mt-1.5 w-full rounded-lg border border-white/20 bg-claw-bg px-3 py-2 text-sm text-zinc-100 outline-none ring-claw-cyan/40 focus:ring-2"
                    disabled={saving}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-300">
                  Kind
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as '' | LocalCustomSourceKind)}
                    className="mt-1.5 w-full rounded-lg border border-white/20 bg-claw-bg px-3 py-2 text-sm text-zinc-100 outline-none ring-claw-cyan/40 focus:ring-2"
                    disabled={saving}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value || 'auto'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-zinc-300">
                Command
                <input
                  type="text"
                  required
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="my-tool"
                  className="mt-1.5 w-full rounded-lg border border-white/20 bg-claw-bg px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-claw-cyan/40 focus:ring-2"
                  disabled={saving}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Args (comma-separated)
                  <input
                    type="text"
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    placeholder="--json, --quiet"
                    className="mt-1.5 w-full rounded-lg border border-white/20 bg-claw-bg px-3 py-2 font-mono text-xs text-zinc-100 outline-none ring-claw-cyan/40 focus:ring-2"
                    disabled={saving}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-300">
                  Display name (optional)
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/20 bg-claw-bg px-3 py-2 text-sm text-zinc-100 outline-none ring-claw-cyan/40 focus:ring-2"
                    disabled={saving}
                  />
                </label>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add source'}
            </button>
            {status === 'ok' && message ? (
              <p className="text-xs text-emerald-400" role="status">
                {message}
              </p>
            ) : null}
            {status === 'err' && message ? (
              <p className="text-xs text-red-400" role="alert">
                {message}
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}
