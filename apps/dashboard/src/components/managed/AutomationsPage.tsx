'use client'

import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import {
  AUTOMATION_SUBS,
  EVENT_TYPES,
  INBOUND_WEBHOOKS,
  SCHEDULES,
  WATCHED_SOURCE_DETAIL,
  WATCHED_SOURCES,
} from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Tab = 'subscriptions' | 'watched' | 'webhooks' | 'schedules' | 'types'

const CRUMB: Record<Tab, string | null> = {
  subscriptions: null,
  watched: 'Watched sources',
  webhooks: 'Inbound webhooks',
  schedules: 'Schedules',
  types: 'Event types',
}

export function AutomationsPage() {
  const [tab, setTab] = useState<Tab>('subscriptions')
  const [selectedId, setSelectedId] = useState<string>(AUTOMATION_SUBS[0]!.id)
  const [watchId, setWatchId] = useState<string>(WATCHED_SOURCES[0]!.id)
  const selected = AUTOMATION_SUBS.find((s) => s.id === selectedId) ?? AUTOMATION_SUBS[0]!
  const selectedWatch = WATCHED_SOURCES.find((w) => w.id === watchId) ?? WATCHED_SOURCES[0]!

  return (
    <PageChrome
      crumbs={CRUMB[tab] ? ['Automations', CRUMB[tab]!] : ['Automations']}
      title="Automations"
      description="What runs on its own: events you send out, sources you watch, webhooks you receive, and schedules."
      actions={
        tab === 'watched' ? (
          <Button type="button">Watch a source</Button>
        ) : tab === 'schedules' ? (
          <Button type="button">New schedule</Button>
        ) : tab === 'webhooks' || tab === 'types' ? undefined : (
          <Button type="button">New subscription</Button>
        )
      }
    >
      <TabBar
        testIdPrefix="automations-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'subscriptions', label: 'Subscriptions', count: AUTOMATION_SUBS.length },
          { id: 'watched', label: 'Watched sources', count: WATCHED_SOURCES.length },
          {
            id: 'webhooks',
            label: 'Inbound webhooks',
            count: INBOUND_WEBHOOKS.filter((w) => w.setup).length,
          },
          { id: 'schedules', label: 'Schedules', count: SCHEDULES.length },
          { id: 'types', label: 'Event types', count: EVENT_TYPES.length },
        ]}
      />

      {tab === 'watched' ? (
        <WatchedSourcesPanel selectedId={selectedWatch.id} onSelect={setWatchId} />
      ) : null}
      {tab === 'webhooks' ? <InboundWebhooksPanel /> : null}
      {tab === 'schedules' ? <SchedulesPanel /> : null}
      {tab === 'types' ? <EventTypesPanel /> : null}

      {tab === 'subscriptions' ? (
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
                Retries keep the same event ID so receivers process once. Every delivery attempt is in the
                audit log.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </PageChrome>
  )
}

function InboundWebhooksPanel() {
  return (
    <div className="space-y-4" data-testid="automations-webhooks">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
        Services push events to these addresses. Each one is checked against the service&apos;s signature, marked
        untrusted, and only reaches subscriptions that opt in. Agents treat what&apos;s inside as data, never as
        instructions.
      </div>
      <ul className="space-y-3">
        {INBOUND_WEBHOOKS.map((hook) => (
          <li
            key={hook.id}
            className={cn(
              'rounded-xl border bg-white p-5 shadow-sm',
              hook.setup ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50/40',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{hook.name}</h3>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
                      hook.tone === 'ok' && 'bg-emerald-100 text-emerald-800',
                      hook.tone === 'neutral' && 'bg-slate-200 text-slate-600',
                    )}
                  >
                    {hook.tone === 'ok' ? <StatusDot tone="ok" /> : null}
                    {hook.status}
                  </span>
                </div>
                {hook.stats ? <p className="mt-1 text-xs text-slate-500">{hook.stats}</p> : null}
              </div>
              {hook.setup ? (
                <Button type="button" variant="outline" size="sm">
                  Rotate secret
                </Button>
              ) : (
                <Button type="button" size="sm">
                  Set up
                </Button>
              )}
            </div>
            {hook.url ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
                  {hook.url}
                </code>
                <Button type="button" variant="outline" size="sm">
                  Copy
                </Button>
              </div>
            ) : null}
            <p className="mt-3 text-sm text-slate-600">{hook.description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SchedulesPanel() {
  return (
    <div className="space-y-4" data-testid="automations-schedules">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Schedule</th>
              <th className="px-4 py-3 font-medium">Runs</th>
              <th className="px-4 py-3 font-medium">Runs as</th>
              <th className="px-4 py-3 font-medium">Last run</th>
              <th className="px-4 py-3 font-medium">Next run</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {SCHEDULES.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-slate-600">{row.runs}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {row.runsAs}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-slate-700">
                    <StatusDot tone={row.lastTone} />
                    {row.lastRun}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.nextRun}</td>
                <td className="px-4 py-3">
                  <button type="button" className="text-sky-700 hover:underline">
                    Run now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-500">
        A schedule runs with its key&apos;s permissions, so anything that writes still waits for a mandate. Each
        run sends a <span className="font-mono text-xs">schedule.completed</span> event; if its source keeps
        failing to sign in, it pauses and sends <span className="font-mono text-xs">schedule.paused</span>.
      </p>
    </div>
  )
}

function EventTypesPanel() {
  return (
    <div className="space-y-4" data-testid="automations-types">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Sent when</th>
              <th className="px-4 py-3 font-medium">Subscriptions</th>
              <th className="px-4 py-3 font-medium">Last 24 hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {EVENT_TYPES.map((row) => (
              <tr key={row.event}>
                <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">{row.event}</td>
                <td className="px-4 py-3 text-slate-600">{row.when}</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{row.subscriptions}</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{row.last24h}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">How events arrive</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Webhooks are signed to the Standard Webhooks format. Retries keep the same event ID, so receivers that
            drop duplicates process each event once (at-least-once delivery).
          </li>
          <li>The live stream uses CloudEvents and resumes from the last event a client saw.</li>
          <li>Every payload has personal data redacted before it&apos;s sent.</li>
          <li>
            The same seven types are available to MCP clients and through{' '}
            <span className="font-mono text-xs">/events</span>.
          </li>
        </ul>
      </section>
    </div>
  )
}

function WatchedSourcesPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected = WATCHED_SOURCES.find((w) => w.id === selectedId) ?? WATCHED_SOURCES[0]!
  const detail = selected.id === WATCHED_SOURCE_DETAIL.id ? WATCHED_SOURCE_DETAIL : null

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Watch</th>
              <th className="px-4 py-3 font-medium">Checks</th>
              <th className="px-4 py-3 font-medium">Last change</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {WATCHED_SOURCES.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'cursor-pointer hover:bg-slate-50/80',
                  row.id === selected.id && 'bg-amber-50/50',
                )}
                onClick={() => onSelect(row.id)}
                data-testid={`watch-${row.id}`}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.watch}</p>
                  <p className="text-xs text-slate-500">{row.watchDetail}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.checks}</td>
                <td className="px-4 py-3 text-slate-600">{row.lastChange}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                      row.tone === 'ok' && 'bg-emerald-100 text-emerald-800',
                      row.tone === 'warn' && 'bg-amber-100 text-amber-900',
                      row.tone === 'danger' && 'bg-rose-100 text-rose-800',
                    )}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{detail.title}</h2>
              <p className="mt-1 font-mono text-xs text-slate-500">{detail.endpoint}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm">
                Pause
              </Button>
              <Button type="button" size="sm">
                Check now
              </Button>
            </div>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-slate-900">Fields that count as a change</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.fields.map((f) => (
              <span
                key={f.name}
                className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800"
              >
                {f.name}
                {f.note ? <span className="ml-1 text-slate-500">{f.note}</span> : null}
              </span>
            ))}
            <button
              type="button"
              className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500"
            >
              Add a field
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Anything else in the response is ignored, so timestamps and paging cursors don&apos;t fire events.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(
              [
                ['How changes are found', detail.howFound, detail.howFoundNote],
                ['Bursts', detail.bursts, detail.burstsNote],
                ['Rate limits', detail.rateLimits, detail.rateLimitsNote],
              ] as const
            ).map(([title, value, note]) => (
              <div key={title} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-medium text-slate-500">{title}</p>
                <p className="mt-1 font-medium text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{note}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-5 text-sm font-semibold text-slate-900">
            Last change, {detail.lastChangeAt}
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1 font-medium" />
                  <th className="py-1 font-medium">id</th>
                  <th className="py-1 font-medium">amount</th>
                  <th className="py-1 font-medium">failure_code</th>
                  <th className="py-1 font-medium">customer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 font-medium text-emerald-700">{row.action}</td>
                    <td className="py-2 font-mono text-xs">{row.id}</td>
                    <td className="py-2">{row.amount}</td>
                    <td className="py-2 font-mono text-xs">{row.failure}</td>
                    <td className="py-2 font-mono text-xs">{row.customer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Sent as one <span className="font-mono">stream.changed</span> event to 1 subscription:{' '}
            <button type="button" className="text-sky-700 hover:underline">
              Ops dashboard
            </button>
            , the live stream.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
          Select Failed payments for the full mockup detail, or wire the remaining watches next.
        </div>
      )}
    </div>
  )
}
