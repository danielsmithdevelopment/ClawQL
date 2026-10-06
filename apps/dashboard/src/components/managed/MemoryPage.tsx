'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import {
  ERASURE_JOB,
  ERASURE_PREVIEW,
  MEMORY_FIELDS,
  MEMORY_RESULTS,
  ONTOLOGY_CONTRACT_FIELDS,
  ONTOLOGY_TYPES,
  PIPELINE_DETAIL,
  PIPELINE_DOCS,
} from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'explorer' | 'uploads' | 'pipelines' | 'ontology'
type View = 'main' | 'erase-confirm' | 'erase-progress'

export function MemoryPage() {
  const [tab, setTab] = useState<Tab>('explorer')
  const [view, setView] = useState<View>('main')
  const [query, setQuery] = useState('Northwind contract value')
  const [selectedId, setSelectedId] = useState<string>(MEMORY_RESULTS[0]!.id)
  const [ontologyId, setOntologyId] = useState<string>(ONTOLOGY_TYPES[0]!.id)
  const [pipelineId, setPipelineId] = useState<string>(PIPELINE_DOCS[0]!.id)
  const [eraseChecked, setEraseChecked] = useState(true)
  const [eraseReason, setEraseReason] = useState<string>(ERASURE_PREVIEW.reason)

  const selected = MEMORY_RESULTS.find((r) => r.id === selectedId) ?? MEMORY_RESULTS[0]!
  const ontology = ONTOLOGY_TYPES.find((t) => t.id === ontologyId) ?? ONTOLOGY_TYPES[0]!
  const pipeline = PIPELINE_DOCS.find((d) => d.id === pipelineId) ?? PIPELINE_DOCS[0]!

  if (view === 'erase-progress') {
    const pct = Math.round((ERASURE_JOB.done / ERASURE_JOB.total) * 100)
    return (
      <PageChrome
        crumbs={['Memory & documents', 'Erasure']}
        title={`Erasing ${ERASURE_JOB.subject}`}
        description={`Started ${ERASURE_JOB.started} by ${ERASURE_JOB.by}, confirmed with her security key. Job \`${ERASURE_JOB.jobId}\`.`}
        actions={
          <span className="inline-flex items-center gap-2 text-sm text-slate-600">
            <StatusDot tone="neutral" />
            {ERASURE_JOB.done} of {ERASURE_JOB.total} steps done
          </span>
        }
      >
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-amber-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="erasure-progress">
          <ul className="space-y-4">
            {ERASURE_JOB.steps.map((step) => (
              <li key={step.id} className="flex gap-3">
                <span className="mt-0.5">
                  {step.state === 'done' ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700">
                      ✓
                    </span>
                  ) : step.state === 'running' ? (
                    <span className="flex size-5 items-center justify-center rounded-full border-2 border-sky-500" />
                  ) : (
                    <span className="flex size-5 items-center justify-center rounded-full border border-slate-300" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                    {step.at ? (
                      <span className="text-xs text-slate-400">{step.at}</span>
                    ) : (
                      <span
                        className={cn(
                          'text-xs font-medium',
                          step.state === 'running' ? 'text-sky-700' : 'text-slate-400',
                        )}
                      >
                        {step.state === 'running' ? 'Running' : 'Waiting'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{step.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">You can leave this page</p>
            <p className="mt-1">
              The job keeps going and resumes after any interruption. You&apos;ll get a notification when the
              final check passes.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">Certificate of erasure</p>
                <p className="mt-1">
                  Ready after the final check, to send to Jane. It lists what was erased, without including any of
                  her data.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled>
                Download
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button type="button" variant="outline" onClick={() => setView('main')}>
            Back to Memory
          </Button>
        </div>
      </PageChrome>
    )
  }

  return (
    <>
      <PageChrome
        crumbs={
          tab === 'ontology'
            ? ['Memory & documents', 'Ontology']
            : tab === 'pipelines'
              ? ['Memory & documents', 'Pipelines']
              : ['Memory & documents']
        }
        title="Memory & documents"
        description={
          tab === 'ontology'
            ? 'The ontology gives your data types and fields, so agents can filter and query it exactly instead of guessing from text.'
            : tab === 'pipelines'
              ? 'Every document goes through a pipeline: converted, read into typed fields, redacted, then stored.'
              : "What your agents remember and the documents they've read, with where every fact came from."
        }
        actions={
          tab === 'ontology' ? (
            <Button type="button">Query with SQL</Button>
          ) : (
            <>
              {tab === 'explorer' ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-700">
                  /memory
                  <button
                    type="button"
                    className="text-sky-700 hover:underline"
                    onClick={() => void navigator.clipboard?.writeText('/memory')}
                  >
                    Copy
                  </button>
                </div>
              ) : null}
              <Button type="button">Upload documents</Button>
            </>
          )
        }
      >
        <TabBar
          testIdPrefix="memory-tab"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'explorer', label: 'Context explorer' },
            { id: 'uploads', label: 'Uploads', count: 1284 },
            { id: 'pipelines', label: 'Pipelines' },
            { id: 'ontology', label: 'Ontology' },
          ]}
        />

        {tab === 'uploads' ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Document upload history fixture — wire the documents pipeline next.
          </div>
        ) : null}

        {tab === 'ontology' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_1fr]">
            <ul className="space-y-1">
              {ONTOLOGY_TYPES.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOntologyId(t.id)}
                    data-testid={`ontology-${t.id}`}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm',
                      t.id === ontology.id
                        ? 'bg-amber-50 font-semibold text-slate-900 ring-1 ring-amber-200'
                        : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span>{t.name}</span>
                    <span className="tabular-nums text-slate-500">{t.count.toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{ontology.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {ontology.count.toLocaleString()} records, filled from the contracts pipeline and the CRM
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm">
                  Add a field
                </Button>
              </div>
              {ontology.id === 'contract' ? (
                <>
                  <table className="mt-4 w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="pb-2 font-medium">Field</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Filled in</th>
                        <th className="pb-2 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ONTOLOGY_CONTRACT_FIELDS.map((f) => (
                        <tr key={f.name}>
                          <td className="py-2">
                            <span className="font-mono text-slate-900">{f.name}</span>
                            {f.required ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">
                                required
                              </span>
                            ) : null}
                            {f.personal ? (
                              <span className="ml-2 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                                Personal data
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-slate-600">{f.type}</td>
                          <td className="py-2 text-slate-600">{f.filled}</td>
                          <td className="py-2 text-slate-600">{f.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-slate-500">
                    &quot;Since Mar 2025&quot; means the field started then — older records stay null and queries
                    should treat them that way.
                  </p>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">
                      Suggested field: auto_renews, yes or no
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Agents asked about auto-renewal in 23 sessions this month, and the pipeline found renewal
                      language in 71% of contracts. Adding the field lets them filter on it directly.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="outline" size="sm">
                        Dismiss
                      </Button>
                      <Button type="button" size="sm">
                        Review the suggestion
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Contract is the fully mocked type. Other types reuse the same schema browser shape.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'pipelines' ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium">Pipeline</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PIPELINE_DOCS.map((doc) => (
                    <tr
                      key={doc.id}
                      className={cn(
                        'cursor-pointer hover:bg-slate-50/80',
                        doc.id === pipeline.id && 'bg-amber-50/50',
                      )}
                      onClick={() => setPipelineId(doc.id)}
                      data-testid={`pipeline-${doc.id}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{doc.document}</p>
                        <p className="text-xs text-slate-500">
                          {doc.received}, {doc.from}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{doc.pipeline}</td>
                      <td className="px-4 py-3 text-slate-600">{doc.result}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
                            doc.tone === 'ok' && 'bg-emerald-100 text-emerald-800',
                            doc.tone === 'warn' && 'bg-amber-100 text-amber-900',
                            doc.tone === 'danger' && 'bg-rose-100 text-rose-800',
                            doc.tone === 'neutral' && 'text-slate-700',
                          )}
                        >
                          {doc.tone === 'neutral' ? <StatusDot tone="neutral" /> : null}
                          {doc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pipeline.id === PIPELINE_DETAIL.id ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">{PIPELINE_DETAIL.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{PIPELINE_DETAIL.subtitle}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-5">
                  {PIPELINE_DETAIL.steps.map((step) => (
                    <div
                      key={step.label}
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm',
                        step.state === 'done' && 'bg-emerald-50 text-emerald-950',
                        step.state === 'waiting' && 'border border-amber-300 bg-white text-slate-800',
                      )}
                    >
                      <p className="font-semibold">{step.label}</p>
                      <p className="mt-1 text-xs opacity-80">{step.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {PIPELINE_DETAIL.fieldNeed.name} needs a person
                    </h3>
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                      {PIPELINE_DETAIL.fieldNeed.badge}
                    </span>
                  </div>
                  <blockquote className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    {PIPELINE_DETAIL.fieldNeed.quote}
                  </blockquote>
                  <p className="mt-3 text-sm text-slate-700">{PIPELINE_DETAIL.fieldNeed.question}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button">Yes, 10%</Button>
                    <input
                      placeholder="Correct value"
                      className="h-9 w-40 rounded-lg border border-slate-200 px-3 text-sm"
                    />
                    <Button type="button" variant="outline">
                      Leave empty
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Your answer is stored as verified, with your name as the verifier.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'explorer' ? (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Search memory"
              />
              <Button type="button">Search</Button>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              {['All 4', 'Entities', 'Notes', 'Documents'].map((f, i) => (
                <button
                  key={f}
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1',
                    i === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200',
                  )}
                >
                  {f}
                </button>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                Contract.counterparty = Northwind
                <button type="button" className="text-slate-400 hover:text-slate-700">
                  ×
                </button>
              </span>
              <button
                type="button"
                className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500"
              >
                Add typed filter
              </button>
              <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" /> Include stale notes
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
              <ul className="space-y-2">
                {MEMORY_RESULTS.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 text-left',
                        row.id === selected.id
                          ? 'border-amber-200 bg-amber-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {row.kind}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                            row.badgeTone === 'ok' && 'bg-emerald-100 text-emerald-800',
                            row.badgeTone === 'warn' && 'bg-amber-100 text-amber-900',
                            row.badgeTone === 'neutral' && 'bg-slate-200 text-slate-700',
                          )}
                        >
                          {row.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{row.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.summary}</p>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{selected.title}</h2>
                    <p className="font-mono text-xs text-slate-500">{selected.id}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setView('erase-confirm')}>
                      Erase…
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setTab('ontology')}>
                      Open in Ontology
                    </Button>
                  </div>
                </div>
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-2 font-medium">Field</th>
                      <th className="pb-2 font-medium">Value</th>
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MEMORY_FIELDS.map((row) => (
                      <tr key={row.field}>
                        <td className="py-2 font-medium text-slate-800">{row.field}</td>
                        <td className="py-2 text-slate-700">{row.value}</td>
                        <td className="py-2">
                          <button type="button" className="text-sky-700 hover:underline">
                            {row.source}
                          </button>
                        </td>
                        <td className="py-2">
                          <span
                            className={cn(
                              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                              row.tone === 'ok' && 'bg-emerald-100 text-emerald-800',
                              row.tone === 'warn' && 'bg-amber-100 text-amber-900',
                              row.tone === 'neutral' && 'bg-slate-200 text-slate-700',
                            )}
                          >
                            {row.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-4 text-xs text-slate-500">
                  Linked: Amendment 2.pdf · Northwind pricing history · Recalled by legal-ops agent, today 09:22
                </p>
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                  Erasing removes this from every store at once. A hashed reference stays in the audit log. Needs
                  your security key.
                </div>
              </div>
            </div>
          </>
        ) : null}
      </PageChrome>

      {view === 'erase-confirm' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="erase-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="erase-title" className="text-xl font-semibold text-slate-900">
              Erase everything about {ERASURE_PREVIEW.subject}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Deletion request received {ERASURE_PREVIEW.received}, ticket {ERASURE_PREVIEW.ticket}.{' '}
              {ERASURE_PREVIEW.matched}
            </p>
            <h3 className="mt-5 text-sm font-semibold text-slate-900">What will be erased</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Where</th>
                  <th className="pb-2 font-medium">Found</th>
                  <th className="pb-2 font-medium">How</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ERASURE_PREVIEW.rows.map((row) => (
                  <tr key={row.where}>
                    <td className="py-2 font-medium text-slate-800">{row.where}</td>
                    <td className="py-2 text-slate-600">{row.found}</td>
                    <td className="py-2 text-slate-600">{row.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                <p className="font-semibold">What stays</p>
                <p className="mt-1 text-xs">
                  Audit logs keep a hashed reference (no PII). Business records stay with personal fields cleared.
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-semibold">One past training export included her.</p>
                <p className="mt-1 text-xs">
                  The Sep 12 export is flagged to regenerate; she&apos;s blocked from future exports.{' '}
                  <button type="button" className="text-sky-700 hover:underline">
                    See the export
                  </button>
                </p>
              </div>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-800">
              Reason, for the record
              <input
                value={eraseReason}
                onChange={(e) => setEraseReason(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={eraseChecked}
                onChange={(e) => setEraseChecked(e.target.checked)}
              />
              I understand this can&apos;t be undone
            </label>
            <p className="mt-4 text-xs text-slate-500">
              Erasing needs your security key. It runs as a job you can leave, and ends with a check of every
              store.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setView('main')}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!eraseChecked}
                className="bg-rose-900 hover:bg-rose-800"
                onClick={() => setView('erase-progress')}
                data-testid="erase-confirm"
              >
                Erase with security key
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
