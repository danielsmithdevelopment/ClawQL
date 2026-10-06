'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { SESSIONS } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'active' | 'waiting' | 'blocked'

export function SessionsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string>(SESSIONS[0]!.id)

  const filtered = useMemo(() => {
    return SESSIONS.filter((s) => {
      if (filter === 'active') return s.active
      if (filter === 'waiting') return s.status === 'Waiting on a person'
      if (filter === 'blocked') return s.status === 'Blocked call'
      return true
    })
  }, [filter])

  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? SESSIONS[0]!

  return (
    <PageChrome
      crumbs={['Sessions']}
      title="Sessions"
      description="Every agent session through your gateway: what it called, what it cost, and what the gates decided."
    >
      <TabBar
        testIdPrefix="sessions-tab"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'all', label: 'All', count: 128 },
          { id: 'active', label: 'Active', count: 3 },
          { id: 'waiting', label: 'Waiting on a person', count: 1 },
          { id: 'blocked', label: 'Blocked calls', count: 2 },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Search agents, people, tools"
          className="h-9 min-w-[16rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        />
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
          <option>Last 24 hours</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <ul className="space-y-2">
          {filtered.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => setSelectedId(session.id)}
                data-testid={`session-${session.id}`}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left',
                  session.id === selected.id
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{session.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{session.meta}</p>
                <p className="mt-1 text-xs text-slate-600">{session.stats}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-700">
                  <StatusDot tone={session.tone} />
                  {session.status}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
              <p className="font-mono text-xs text-slate-500">{selected.id}</p>
              <p className="mt-1 text-sm text-slate-600">{selected.meta}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm">
                End session
              </Button>
              <Link
                href="/review"
                className="inline-flex h-7 items-center rounded-lg bg-slate-900 px-2.5 text-[0.8rem] font-medium text-white hover:bg-slate-800"
              >
                Open in Review
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              ['Tool calls', '34'],
              ['Cost so far', '$1.82'],
              ['Model', 'Claude Sonnet 4.6'],
              ['Redactions', '2'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">{k}</p>
                <p className="font-semibold text-slate-900">{v}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm text-slate-700">
            <span className="font-medium">Task:</span> Reconcile the Northwind MSA amendment and update the contract
            record.
          </p>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Timeline</h3>
              <button type="button" className="text-xs text-sky-700 hover:underline">
                Export evidence
              </button>
            </div>
            <ol className="space-y-3 border-l border-slate-200 pl-3">
              {[
                ['09:22:05', 'memory_recall', 'allowed', 'Northwind MSA amendment — 4 notes and 1 contract record.'],
                ['09:23:48', 'document pipeline', '2 redacted', 'Amendment 2 PDF: 12 fields extracted.'],
                ['09:25:02', 'crm.contracts.get', 'allowed, read', 'Loaded Northwind MSA: $48,500.00.'],
                [
                  '09:26:30',
                  'adjust_contract_value',
                  'MEDIUM risk, mandate requested',
                  'Change $48,500.00 → $52,000.00. Waiting for Dana Reyes.',
                ],
                [
                  '09:27:15',
                  'email.send',
                  'blocked',
                  'Outside address blocked by information-flow policy.',
                ],
              ].map(([time, tool, status, body]) => (
                <li key={time}>
                  <p className="font-mono text-[11px] text-slate-500">
                    {time} · {tool} · {status}
                  </p>
                  <p className="text-sm text-slate-700">{body}</p>
                </li>
              ))}
            </ol>
          </section>
          <p className="mt-4 text-xs text-slate-500">
            Every step is in the audit log, and the chain verifies.{' '}
            <Link href="/audit" className="text-sky-700 hover:underline">
              Open in Audit
            </Link>
          </p>
        </div>
      </div>
    </PageChrome>
  )
}
