'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { MEMORY_FIELDS, MEMORY_RESULTS } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'explorer' | 'uploads' | 'pipelines' | 'ontology'

export function MemoryPage() {
  const [tab, setTab] = useState<Tab>('explorer')
  const [query, setQuery] = useState('Northwind contract value')
  const [selectedId, setSelectedId] = useState(MEMORY_RESULTS[0]!.id)
  const selected = MEMORY_RESULTS.find((r) => r.id === selectedId) ?? MEMORY_RESULTS[0]!

  return (
    <PageChrome
      crumbs={['Memory & documents']}
      title="Memory & documents"
      description="What your agents remember and the documents they've read, with where every fact came from."
      actions={
        <>
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
          <Button type="button">Upload documents</Button>
        </>
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

      {tab !== 'explorer' ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {tab === 'uploads' && 'Document upload history fixture — wire the documents pipeline next.'}
          {tab === 'pipelines' && 'Pipeline runs will surface here.'}
          {tab === 'ontology' && 'Ontology browser will open from entity detail.'}
        </div>
      ) : (
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
            <button type="button" className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500">
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
                  <Button type="button" variant="outline" size="sm">
                    Erase…
                  </Button>
                  <Button type="button" variant="outline" size="sm">
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
                Erasing removes this from every store at once. A hashed reference stays in the audit log. Needs your
                security key.
              </div>
            </div>
          </div>
        </>
      )}
    </PageChrome>
  )
}
