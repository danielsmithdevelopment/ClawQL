'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { GATEWAY_BASE } from '@/lib/managed/fixtures'
import { DECISION_SITES, GATEWAY_ROUTES, MCP_CLIENTS, MCP_TOOLS } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'inference' | 'mcp' | 'sites'

function stageTone(stage: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (stage === 'trusted') return 'ok'
  if (stage === 're-proving') return 'danger'
  if (stage === 'proving') return 'warn'
  return 'neutral'
}

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>('sites')
  const [mcpClient, setMcpClient] = useState<'claude' | 'cursor' | 'codex' | 'chatgpt'>('cursor')
  const [selectedId, setSelectedId] = useState(DECISION_SITES[0]!.id)
  const selected = useMemo(
    () => DECISION_SITES.find((s) => s.id === selectedId) ?? DECISION_SITES[0]!,
    [selectedId],
  )

  return (
    <PageChrome
      crumbs={
        tab === 'sites'
          ? ['Gateway', 'Decision sites']
          : tab === 'mcp'
            ? ['Gateway', 'MCP']
            : ['Gateway']
      }
      title="Gateway"
      description="One endpoint for your agents: models, tools and decisions, with the same identity, policy and audit everywhere."
      actions={
        tab === 'sites' ? (
          <Button type="button">New decision site</Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-700">
            {GATEWAY_BASE}
          </div>
        )
      }
    >
      <TabBar
        testIdPrefix="gateway-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'inference', label: 'Inference' },
          { id: 'mcp', label: 'MCP' },
          { id: 'sites', label: 'Decision sites', count: DECISION_SITES.length },
        ]}
      />

      {tab === 'inference' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">OpenAI-compatible endpoint</h2>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                  {`OPENAI_BASE_URL=${GATEWAY_BASE}/v1`}
                </pre>
              </div>
              <Button type="button">Send a test request</Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ['Requests', '41,208'],
                ['Errors', '0.3%'],
                ['Fallbacks', '62'],
                ['Spend today', '$96.40'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="text-lg font-semibold text-slate-900">{v}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Model routes</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {GATEWAY_ROUTES.map((route) => (
                <li key={route.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-mono text-sm font-medium text-slate-900">{route.label}</p>
                    <p className="text-xs text-slate-500">{route.chain}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                    <StatusDot tone={route.tone} />
                    {route.status}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
              {['Fall back on failure', 'Redact PII', 'Add memory to requests'].map((label) => (
                <label key={label} className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'mcp' ? (
        <div className="space-y-4" data-testid="gateway-mcp">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Connect an MCP client</h2>
            <p className="mt-1 text-sm text-slate-600">
              One command writes the config. The client then sees every connection its key group allows.
            </p>
            <div className="mt-3 flex flex-wrap gap-1 rounded-lg border border-slate-200 p-0.5 text-sm">
              {(
                [
                  ['claude', 'Claude'],
                  ['cursor', 'Cursor'],
                  ['codex', 'Codex'],
                  ['chatgpt', 'ChatGPT'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMcpClient(id)}
                  className={cn(
                    'rounded-md px-3 py-1.5',
                    mcpClient === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
              {`clawql mcp-config --write ${mcpClient}`}
            </pre>
            <p className="mt-3 text-sm text-slate-600">
              Or point any client at{' '}
              <span className="font-mono text-xs">{GATEWAY_BASE}/mcp</span> with a key from{' '}
              <Link href="/connections" className="text-sky-700 hover:underline">
                Connections & keys
              </Link>
              .
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">What agents see</h2>
            <p className="mt-1 text-sm text-slate-600">
              A small set of tools. The 2,140 operations across your connections sit behind search and execute, so
              agents never load them all up front.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MCP_TOOLS.map((tool) => (
                <span
                  key={tool}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800"
                >
                  {tool}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['Risk in search results', 'On. Agents see whether a call needs a mandate before trying it.'],
                ['Approvals', 'Never an agent tool. Approving happens only in Review, by a person.'],
                ['ChatGPT extras', 'Shown to ChatGPT only. Approval forms, evidence and console views.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-800">{title}</p>
                  <p className="mt-1 text-xs text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Clients connected, last 24 hours</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {MCP_CLIENTS.map((row) => (
                <li key={row.client} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{row.client}</p>
                    <p className="font-mono text-xs text-slate-500">{row.keys}</p>
                  </div>
                  <p className="text-slate-600">{row.sessions} sessions</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'sites' ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            How a site earns trust:{' '}
            <span className="font-medium text-slate-800">Exploring → Proving → Trusted</span>. Until a site is
            trusted, every call escalates to a model or a person.
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Site</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Answers on its own</th>
                  <th className="px-4 py-3 font-medium">Calls (7d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {DECISION_SITES.map((site) => (
                  <tr
                    key={site.id}
                    className={cn(
                      'cursor-pointer hover:bg-slate-50/80',
                      site.id === selected.id && 'bg-amber-50/50',
                    )}
                    onClick={() => setSelectedId(site.id)}
                    data-testid={`decision-site-${site.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900">{site.name}</td>
                    <td className="px-4 py-3 text-slate-600">{site.model}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot tone={stageTone(site.stage)} />
                        {site.stageLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{site.answers}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{site.calls7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-lg font-semibold text-slate-900">{selected.name}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium">
                    <StatusDot tone={stageTone(selected.stage)} />
                    {selected.stageLabel}
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">{selected.description}</p>
              </div>
              {selected.stage === 're-proving' ? (
                <Button type="button">Build the fresh evaluation</Button>
              ) : null}
            </div>
            {selected.stage === 're-proving' ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                The tool catalog changed on Oct 3, so the evaluation this site passed no longer describes the tools
                it chooses between. Until a fresh evaluation passes, it reports <code>calibrated: false</code> and
                every call escalates.
              </div>
            ) : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {[
                ['Aug 12', 'Exploring', 'Labels gathered from escalations'],
                ['Sep 2', 'Proved', 'Answered 43% of hold-out, 0 wrong'],
                ['Sep 2–Oct 3', 'Trusted', 'Answered on its own when sure'],
                ['Now', 'Re-proving', 'Needs a fresh set on the new catalog'],
              ].map(([when, stage, body]) => (
                <div key={when} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">
                    {when} · {stage}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Last evaluation, now retired</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  <li>Held-out questions: 75, scored once</li>
                  <li>Answered on its own: 32 (43%)</li>
                  <li>Wrong answers: 0</li>
                  <li>Escalated: 43</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">To become trusted again</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>Freeze the new tool catalog</li>
                  <li>Build a fresh evaluation set against it</li>
                  <li>Fit calibration on a separate set</li>
                  <li>Score once, with zero wrong answers among the ones it decides</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageChrome>
  )
}
