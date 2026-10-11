'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { Button } from '@/components/ui/button'
import { AUDIT_CHAIN, AUDIT_ENTRIES, AUDIT_INCIDENT } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type View = 'log' | 'incident'

export function AuditPage() {
  const [view, setView] = useState<View>('log')
  const [selectedId, setSelectedId] = useState('wrm_4906')
  const selected = AUDIT_ENTRIES.find((e) => e.id === selectedId) ?? AUDIT_ENTRIES[2]!

  if (view === 'incident') {
    return (
      <PageChrome
        crumbs={['Audit']}
        title="Audit"
        description="Every action through ClawQL, written once and chained, so anyone can check that nothing was changed or removed."
        actions={
          <Button type="button" variant="outline" onClick={() => setView('log')}>
            View audit log
          </Button>
        }
      >
        <div
          className="mb-5 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-4 shadow-sm"
          data-testid="audit-incident"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="mt-0.5 text-rose-700" aria-hidden>
                ⚠
              </span>
              <div>
                <h2 className="text-base font-semibold text-rose-950">Chain verification failed</h2>
                <p className="mt-1 text-sm text-rose-900">{AUDIT_INCIDENT.summary}</p>
              </div>
            </div>
            <Button type="button" className="bg-rose-900 hover:bg-rose-800">
              Download evidence bundle
            </Button>
          </div>
          <p className="mt-3 text-sm text-rose-950/90">{AUDIT_INCIDENT.explanation}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">What changed</h3>
            <p className="mt-1 text-sm text-slate-500">
              Compared with your offsite copy of the hourly roots, which no one at ClawQL can write to.
            </p>
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1 font-medium">Field</th>
                  <th className="py-1 font-medium">When written, per the proof</th>
                  <th className="py-1 font-medium">Stored now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(
                  [
                    ['Time', AUDIT_INCIDENT.written.time, AUDIT_INCIDENT.stored.time],
                    ['Actor', AUDIT_INCIDENT.written.actor, AUDIT_INCIDENT.stored.actor],
                    ['Action', AUDIT_INCIDENT.written.action, AUDIT_INCIDENT.stored.action],
                    ['Outcome', AUDIT_INCIDENT.written.outcome, AUDIT_INCIDENT.stored.outcome],
                    ['Entry hash', AUDIT_INCIDENT.written.hash, AUDIT_INCIDENT.stored.hash],
                  ] as const
                ).map(([field, written, stored]) => (
                  <tr
                    key={field}
                    className={cn(field === 'Outcome' && 'bg-rose-50/70')}
                  >
                    <td className="py-2 font-medium text-slate-800">{field}</td>
                    <td
                      className={cn(
                        'py-2',
                        field === 'Outcome' ? 'font-medium text-emerald-700' : 'text-slate-700',
                        field === 'Entry hash' && 'font-mono text-xs',
                      )}
                    >
                      {written}
                    </td>
                    <td
                      className={cn(
                        'py-2',
                        field === 'Outcome' ? 'font-medium text-rose-700' : 'text-slate-700',
                        field === 'Entry hash' && 'font-mono text-xs',
                      )}
                    >
                      {stored}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-slate-600">{AUDIT_INCIDENT.paymentNote}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">What still holds</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {AUDIT_INCIDENT.stillHolds.map((item) => (
                <li key={item.text} className="flex gap-2">
                  <StatusDot tone={item.ok ? 'ok' : 'warn'} className="mt-1.5" />
                  {item.text}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">What to do next</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Keep the evidence. Ask about the bundle.{' '}
              <button type="button" className="font-medium text-sky-700 hover:underline">
                Download
              </button>
            </li>
            <li>
              Find who had write access to log storage.{' '}
              <button type="button" className="font-medium text-sky-700 hover:underline">
                Storage access log
              </button>
            </li>
            <li>
              Rotate the storage credentials.{' '}
              <button type="button" className="font-medium text-sky-700 hover:underline">
                Rotate
              </button>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              Restore the entry from offsite proof. Needs two admins with security keys.
              <Button type="button" size="sm">
                Start restore
              </Button>
            </li>
            <li>
              Tell your auditors. Mention the incident report.{' '}
              <button type="button" className="font-medium text-sky-700 hover:underline">
                Incident report
              </button>
            </li>
          </ol>
        </section>
      </PageChrome>
    )
  }

  return (
    <PageChrome
      crumbs={['Audit']}
      title="Audit"
      description="Every action through ClawQL, written once and chained, so anyone can check that nothing was changed or removed."
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => setView('incident')}>
            Open incident
          </Button>
          <Button type="button" variant="outline">
            Export
          </Button>
          <Button type="button">Verify chain now</Button>
        </>
      }
    >
      <div
        className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm shadow-sm"
        data-testid="audit-verified"
      >
        <span className="inline-flex items-center gap-2 font-medium text-emerald-950">
          <StatusDot tone="ok" /> Chain verified (Checked {AUDIT_CHAIN.checkedAgo})
        </span>
        <span className="text-slate-600">Entries: {AUDIT_CHAIN.entries}</span>
        <span className="font-mono text-xs text-slate-500">
          Latest root ({AUDIT_CHAIN.latestRootAt}): {AUDIT_CHAIN.latestRoot}
        </span>
        <span className="text-slate-600">Retention: {AUDIT_CHAIN.retention}</span>
        <button
          type="button"
          className="ml-auto font-medium text-sky-700 hover:underline"
          onClick={() => setView('incident')}
        >
          Open sample incident
        </button>
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
          </div>
        </div>
      </div>
    </PageChrome>
  )
}
