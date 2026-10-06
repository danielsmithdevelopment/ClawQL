'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { AUTOMATION_SUBS } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'subscriptions' | 'watched' | 'webhooks' | 'schedules' | 'types'

export function AutomationsPage() {
  const [tab, setTab] = useState<Tab>('subscriptions')
  const [selectedId, setSelectedId] = useState(AUTOMATION_SUBS[0]!.id)
  const selected = AUTOMATION_SUBS.find((s) => s.id === selectedId) ?? AUTOMATION_SUBS[0]!

  return (
    <PageChrome
      crumbs={['Automations']}
      title="Automations"
      description="What runs on its own: events you send out, sources you watch, webhooks you receive, and schedules."
      actions={<Button type="button">New subscription</Button>}
    >
      <TabBar
        testIdPrefix="automations-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'subscriptions', label: 'Subscriptions', count: AUTOMATION_SUBS.length },
          { id: 'watched', label: 'Watched sources' },
          { id: 'webhooks', label: 'Inbound webhooks' },
          { id: 'schedules', label: 'Schedules' },
          { id: 'types', label: 'Event types' },
        ]}
      />

      {tab !== 'subscriptions' ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Fixture shell for {tab}. Subscriptions is the first wired tab.
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {[
              ['Delivered, 24 hours', '1,906'],
              ['Failing', '1 subscription'],
              ['Waiting to retry', '4 events'],
              ['Paused', '1 subscription'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-xs text-slate-500">{k}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(18rem,24rem)]">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Subscription</th>
                    <th className="px-4 py-3 font-medium">Events</th>
                    <th className="px-4 py-3 font-medium">Delivered by</th>
                    <th className="px-4 py-3 font-medium">Last delivery</th>
                    <th className="px-4 py-3 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {AUTOMATION_SUBS.map((sub) => (
                    <tr
                      key={sub.id}
                      className={cn(
                        'cursor-pointer hover:bg-slate-50/80',
                        sub.id === selected.id && 'bg-amber-50/50',
                      )}
                      onClick={() => setSelectedId(sub.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{sub.name}</p>
                        <p className="text-xs text-slate-500">{sub.target}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{sub.events}</td>
                      <td className="px-4 py-3 text-slate-600">{sub.via}</td>
                      <td className="px-4 py-3 text-slate-600">{sub.last}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot tone={sub.tone} />
                          {sub.health}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{selected.name}</h2>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm">
                    <StatusDot tone={selected.tone} />
                    {selected.health}
                  </p>
                </div>
              </div>
              <p className="mt-3 break-all font-mono text-[11px] text-slate-500">
                https://hooks.slack.com/services/T04…/B07…/…
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm">
                  Pause
                </Button>
                <Button type="button" variant="outline" size="sm">
                  Edit
                </Button>
                <Button type="button" size="sm">
                  Send test event
                </Button>
              </div>
              {selected.tone === 'danger' ? (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  Slack returned <strong>503 Service Unavailable</strong> on the last 4 attempts. Retrying with
                  backoff; next attempt in 2 minutes.
                  <div className="mt-2">
                    <Button type="button" size="sm">
                      Retry all now
                    </Button>
                  </div>
                </div>
              ) : null}
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div>
                  <dt className="text-xs text-slate-500">Events</dt>
                  <dd>{selected.events}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Payloads</dt>
                  <dd>Personal data redacted</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Signing secret</dt>
                  <dd>
                    Rotated 41 days ago{' '}
                    <button type="button" className="text-sky-700 hover:underline">
                      Rotate
                    </button>
                  </dd>
                </div>
              </dl>
              <h3 className="mt-5 text-sm font-semibold text-slate-900">Recent deliveries</h3>
              <ul className="mt-2 space-y-2 text-xs text-slate-600">
                {[
                  ['09:38', 'hook.blocked', '503, retrying'],
                  ['09:31', 'hook.blocked', '503, retrying'],
                  ['07:30', 'budget.exhausted', '503, retrying'],
                  ['Yesterday 18:02', 'hook.blocked', '200, delivered'],
                ].map(([time, event, response]) => (
                  <li key={time + event} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                    <span>
                      {time} · <span className="font-mono">{event}</span>
                    </span>
                    <span>{response}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Retries keep the same event ID. Every delivery attempt is in the audit log.
              </p>
            </div>
          </div>
        </>
      )}
    </PageChrome>
  )
}
