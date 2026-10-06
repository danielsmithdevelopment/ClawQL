'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { Button } from '@/components/ui/button'
import { AUDIT_ENTRIES } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

export function AuditPage() {
  const [selectedId, setSelectedId] = useState('wrm_4906')
  const selected = AUDIT_ENTRIES.find((e) => e.id === selectedId) ?? AUDIT_ENTRIES[2]!

  return (
    <PageChrome
      crumbs={['Audit']}
      title="Audit"
      description="Every action through ClawQL, written once and chained, so anyone can check that nothing was changed or removed."
      actions={
        <>
          <Button type="button" variant="outline">
            Export
          </Button>
          <Button type="button">Verify chain now</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <span className="inline-flex items-center gap-2 font-medium text-emerald-800">
          <StatusDot tone="ok" /> Chain verified — Checked 2 minutes ago
        </span>
        <span className="text-slate-500">Entries: 4,912</span>
        <span className="font-mono text-xs text-slate-500">Latest root, 09:00: b41e…07c9</span>
        <span className="text-slate-500">Retention: 7 years</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Search actions, actors, entry IDs"
          className="h-9 min-w-[16rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        />
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
          <option>All actions</option>
        </select>
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
          <option>Anyone</option>
        </select>
        <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
          <option>Last 24 hours</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Entry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {AUDIT_ENTRIES.map((entry) => (
              <tr
                key={entry.id}
                className={cn(
                  'cursor-pointer hover:bg-slate-50/80',
                  entry.id === selected.id && 'bg-amber-50/50',
                )}
                onClick={() => setSelectedId(entry.id)}
              >
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{entry.time}</td>
                <td className="px-4 py-3 text-slate-800">{entry.actor}</td>
                <td className="px-4 py-3 text-slate-700">{entry.action}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={entry.tone} />
                    {entry.outcome}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-sky-700">{entry.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {selected.action}, {selected.outcome.toLowerCase()}{' '}
              <span className="font-mono text-sm font-normal text-sky-700">{selected.id}</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Today {selected.time}, in session sess_7f2a91c4
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm">
              Copy as OCSF
            </Button>
            <Button type="button" size="sm">
              Verify this entry
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Record</h3>
            <dl className="mt-2 space-y-2 text-sm text-slate-600">
              <div>
                <dt className="text-xs text-slate-500">Actor</dt>
                <dd>{selected.actor}, for Priya Shah, via Claude Code</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Action</dt>
                <dd className="font-mono text-xs">{selected.action.split(' ')[0]}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Decision</dt>
                <dd>
                  {selected.tone === 'danger'
                    ? 'Blocked. The attachment is labeled internal, and this destination only accepts public data.'
                    : selected.outcome}
                </dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Integrity</h3>
            <dl className="mt-2 space-y-2 font-mono text-xs text-slate-600">
              <div>
                <dt className="font-sans text-xs text-slate-500">Entry hash</dt>
                <dd>9f2a…c41d</dd>
              </div>
              <div>
                <dt className="font-sans text-xs text-slate-500">Previous</dt>
                <dd className="text-sky-700">e07b…5a18 (wrm_4905)</dd>
              </div>
              <div>
                <dt className="font-sans text-xs text-slate-500">Hourly root</dt>
                <dd>b41e…07c9</dd>
              </div>
              <div className="flex items-center gap-2 font-sans text-sm text-emerald-800">
                <StatusDot tone="ok" /> Proven in the 09:00 root
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Editing or deleting any earlier entry would change these hashes, and verification would fail.
            </p>
          </div>
        </div>
      </div>
    </PageChrome>
  )
}
