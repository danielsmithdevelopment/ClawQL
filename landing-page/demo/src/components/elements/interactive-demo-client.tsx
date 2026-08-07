'use client'

import { useCallback, useState } from 'react'
import { gatewayUrl } from '@/lib/site'

type DemoSession = {
  sessionId: string
  tenantId: string
  apiToken: string
  expiresAt: string
}

type PipelineStage = {
  id: string
  name: string
  status: 'ok' | 'skipped'
  detail: string
}

type PipelineResult = {
  stages: PipelineStage[]
  markdownPreview: string
  note: string
}

type RecallHit = {
  path: string
  title: string
  score: number
  snippet: string
}

export function InteractiveDemoClient() {
  const [content, setContent] = useState(
    'Sample lease clause: Tenant shall maintain insurance of $1M and provide certificates within 10 days of request.'
  )
  const [filename, setFilename] = useState('lease-excerpt.txt')
  const [session, setSession] = useState<DemoSession | null>(null)
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null)
  const [recall, setRecall] = useState<RecallHit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'live' | 'local'>('live')

  const runLocalPipeline = useCallback(() => {
    const stages: PipelineStage[] = [
      {
        id: 'ingest',
        name: 'Ingest',
        status: 'ok',
        detail: `Accepted ${filename} into local preview (gateway unreachable)`,
      },
      {
        id: 'convert',
        name: 'Convert → Markdown',
        status: 'ok',
        detail: 'Client-side preview only',
      },
      {
        id: 'redact',
        name: 'Stirling redaction',
        status: 'skipped',
        detail: 'Available on IDP tiers (Shared+)',
      },
      {
        id: 'onyx',
        name: 'Onyx semantic index',
        status: 'skipped',
        detail: 'Teams+ / Shared+',
      },
      {
        id: 'coneshare',
        name: 'Coneshare VDR link',
        status: 'skipped',
        detail: 'Available on Shared+',
      },
    ]
    setPipeline({
      stages,
      markdownPreview: `# ${filename}\n\n> Local preview — start the edge gateway for a live 5-minute sandbox.\n\n${content}`,
      note: 'Running offline preview. Deploy clawql-gateway for live vault demo sessions.',
    })
    setMode('local')
    setRecall([
      {
        path: 'local-preview.md',
        title: filename,
        score: 1,
        snippet: content.slice(0, 200),
      },
    ])
  }, [content, filename])

  const runDemo = useCallback(async () => {
    setBusy(true)
    setError(null)
    setRecall(null)
    try {
      const sessionRes = await fetch(`${gatewayUrl}/demo/session`, { method: 'POST' })
      if (!sessionRes.ok) {
        throw new Error(`demo/session HTTP ${sessionRes.status}`)
      }
      const sess = (await sessionRes.json()) as DemoSession
      setSession(sess)
      setMode('live')

      const pipeRes = await fetch(`${gatewayUrl}/demo/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      })
      if (!pipeRes.ok) throw new Error(`demo/pipeline HTTP ${pipeRes.status}`)
      const pipe = (await pipeRes.json()) as PipelineResult
      setPipeline(pipe)

      await fetch(`${gatewayUrl}/memory_ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.apiToken}`,
        },
        body: JSON.stringify({
          title: filename,
          content,
          tags: ['demo'],
        }),
      })

      const recallRes = await fetch(`${gatewayUrl}/memory_recall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.apiToken}`,
        },
        body: JSON.stringify({ query: content.split(/\s+/).slice(0, 6).join(' '), limit: 5 }),
      })
      if (recallRes.ok) {
        const body = (await recallRes.json()) as {
          result?: { hits?: RecallHit[] }
          hits?: RecallHit[]
        }
        setRecall(body.result?.hits ?? body.hits ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      runLocalPipeline()
    } finally {
      setBusy(false)
    }
  }, [content, filename, runLocalPipeline])

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-mist-800" htmlFor="demo-filename">
          Filename
        </label>
        <input
          id="demo-filename"
          className="w-full rounded-md border border-mist-300 bg-white px-3 py-2 text-mist-950"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
        />
        <label className="block text-sm font-medium text-mist-800" htmlFor="demo-content">
          Paste document text (no signup)
        </label>
        <textarea
          id="demo-content"
          className="min-h-40 w-full rounded-md border border-mist-300 bg-white px-3 py-2 font-mono text-sm text-mist-950"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !content.trim()}
          onClick={() => void runDemo()}
          className="rounded-md bg-mist-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Running…' : 'Try with your document'}
        </button>
        <p className="text-sm text-mist-600">
          Live sandbox talks to <code className="text-xs">{gatewayUrl}</code>. Sessions expire in 5
          minutes; documents are deleted with the demo tenant.
        </p>
        {error ? (
          <p className="text-sm text-amber-800">
            Gateway unreachable ({error}). Showing local preview instead.
          </p>
        ) : null}
        {session ? (
          <p className="text-sm text-mist-700">
            Session <code className="text-xs">{session.sessionId}</code> · tenant{' '}
            <code className="text-xs">{session.tenantId}</code> · expires {session.expiresAt} · mode{' '}
            {mode}
          </p>
        ) : null}
      </div>

      {pipeline ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-mist-950">Pipeline stages</h2>
          <ul className="space-y-2">
            {pipeline.stages.map((stage) => (
              <li key={stage.id} className="border-b border-mist-200 pb-2">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-mist-900">{stage.name}</span>
                  <span className="text-xs uppercase tracking-wide text-mist-500">{stage.status}</span>
                </div>
                <p className="text-sm text-mist-600">{stage.detail}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-mist-600">{pipeline.note}</p>
          <pre className="overflow-x-auto rounded-md bg-mist-100 p-4 text-xs text-mist-900 whitespace-pre-wrap">
            {pipeline.markdownPreview}
          </pre>
        </div>
      ) : null}

      {recall && recall.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-mist-950">Vault recall</h2>
          <ul className="space-y-2">
            {recall.map((hit) => (
              <li key={hit.path} className="text-sm text-mist-800">
                <strong>{hit.title}</strong> ({hit.score.toFixed(2)}) — {hit.snippet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
