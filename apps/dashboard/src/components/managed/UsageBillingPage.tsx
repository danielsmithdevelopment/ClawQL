'use client'

import { useEffect, useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { Button } from '@/components/ui/button'
import { fetchManagedUsage, openManagedBillingPortal } from '@/lib/managed/client'
import { DAILY_SPEND, TEAM_SPEND, USAGE_SUMMARY } from '@/lib/managed/fixtures'
import { PAYMENT_LIMITS, PLAN_CREDITS } from '@/lib/managed/fixtures-ops'
import type { ManagedUsageSnapshot } from '@/lib/managed/live/usage'
import { cn } from '@/lib/utils'

type Tab = 'usage' | 'plan' | 'payment'
type Breakdown = 'team' | 'key' | 'model' | 'connection'

const FIXTURE_USAGE: ManagedUsageSnapshot = {
  monthSpent: USAGE_SUMMARY.monthSpent,
  monthBudget: USAGE_SUMMARY.monthBudget,
  forecast: USAGE_SUMMARY.forecast,
  forecastNote: USAGE_SUMMARY.forecastNote,
  todaySpent: USAGE_SUMMARY.todaySpent,
  todayNote: USAGE_SUMMARY.todayNote,
  planRenews: USAGE_SUMMARY.planRenews,
  teamRows: TEAM_SPEND,
  daily: DAILY_SPEND,
  meta: {
    orgId: 'fixture',
    totalCreditsCents: 0,
    poolSpendableCents: 0,
    memberCount: TEAM_SPEND.length,
    generatedAt: new Date(0).toISOString(),
  },
}

export function UsageBillingPage() {
  const [tab, setTab] = useState<Tab>('usage')
  const [breakdown, setBreakdown] = useState<Breakdown>('team')
  const [usage, setUsage] = useState<ManagedUsageSnapshot>(FIXTURE_USAGE)
  const [source, setSource] = useState<'live' | 'fixture'>('fixture')
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchManagedUsage()
      .then((res) => {
        if (cancelled) return
        setUsage(res.usage)
        setSource(res.source)
      })
      .catch(() => {
        /* keep fixture seed */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openPortal = () => {
    setPortalBusy(true)
    setPortalError(null)
    void openManagedBillingPortal(
      typeof window !== 'undefined' ? `${window.location.origin}/usage` : undefined,
    )
      .then((res) => {
        window.location.assign(res.url)
      })
      .catch((e: unknown) => {
        setPortalError(e instanceof Error ? e.message : String(e))
        setPortalBusy(false)
      })
  }

  const maxBar = useMemo(() => Math.max(...usage.daily.map((d) => d.amount), 1), [usage.daily])
  const pct = Math.round((usage.monthSpent / Math.max(usage.monthBudget, 1)) * 100)
  const description =
    tab === 'plan'
      ? 'Your plan, prepaid credits, and every invoice.'
      : tab === 'payment'
        ? 'How you pay, and the limits that keep spend in check.'
        : 'What your agents are spending, where it goes, and the limits that keep it in check.'

  return (
    <PageChrome
      crumbs={
        tab === 'usage'
          ? ['Usage & billing']
          : ['Usage & billing', tab === 'plan' ? 'Plan & credits' : 'Payment & limits']
      }
      title="Usage & billing"
      description={description}
      actions={
        tab === 'usage' ? (
          <>
            <span className="text-sm text-slate-600">{usage.planRenews}</span>
            <Button type="button" variant="outline" disabled={portalBusy} onClick={openPortal}>
              {portalBusy ? 'Opening…' : 'Manage plan'}
            </Button>
          </>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-slate-500" data-testid="usage-data-source">
        Usage source:{' '}
        {source === 'live'
          ? `Unified spend (${usage.meta.orgId})`
          : 'Acme fixture — set CLAWQL_MANAGED_ORG_ID for live'}
      </p>

      <div className="mb-5 flex gap-4 border-b border-slate-200 text-sm">
        {(
          [
            ['usage', 'Usage'],
            ['plan', 'Plan & credits'],
            ['payment', 'Payment & limits'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'border-b-2 px-0.5 pb-2 font-medium transition-colors',
              tab === id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
            data-testid={`usage-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {portalError ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {portalError}
        </p>
      ) : null}

      {tab === 'plan' ? (
        <PlanCreditsPanel
          portalBusy={portalBusy}
          onOpenPortal={openPortal}
          poolNote={
            source === 'live'
              ? `Live pool spendable: $${(usage.meta.poolSpendableCents / 100).toLocaleString()}`
              : undefined
          }
        />
      ) : null}

      {tab === 'payment' ? (
        <PaymentLimitsPanel
          portalBusy={portalBusy}
          onOpenPortal={openPortal}
          monthBudget={usage.monthBudget}
          forecast={usage.forecast}
        />
      ) : null}

      {tab === 'usage' ? (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
              <p className="text-xs font-medium text-slate-500">Spent this period</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                ${usage.monthSpent.toLocaleString()}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {pct}% of the ${usage.monthBudget.toLocaleString()} budget
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm shadow-slate-900/5">
              <p className="text-xs font-medium text-amber-800">Forecast</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                About ${usage.forecast.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-amber-900">{usage.forecastNote}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
              <p className="text-xs font-medium text-slate-500">Spent today, so far</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                ${usage.todaySpent.toFixed(2)}
              </p>
              <p className="mt-2 text-xs text-slate-500">{usage.todayNote}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Daily spend, last 14 days</h2>
              <p className="text-xs text-slate-500">
                {source === 'live'
                  ? 'Daily series stays fixture-shaped until usage metering is connected'
                  : 'Weekends run lighter; busiest days highlighted in the fixture'}
              </p>
            </div>
            <div className="mt-4 flex h-44 items-end gap-1.5 sm:gap-2">
              {usage.daily.map((d) => (
                <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500">{d.amount}</span>
                  <div
                    className={cn(
                      'w-full max-w-[2rem] rounded-t-sm',
                      d.weekend ? 'bg-sky-200' : 'bg-slate-800',
                      d.today && 'bg-[repeating-linear-gradient(135deg,#1e293b_0_4px,#64748b_4px_8px)]',
                    )}
                    style={{ height: `${Math.max(8, (d.amount / maxBar) * 100)}%` }}
                    title={`${d.label}: $${d.amount}`}
                  />
                  <span className="truncate text-[9px] text-slate-400">
                    {d.today ? 'Today' : d.label.replace(/^\w+ /, '')}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Dollars per day. Lighter bars are weekends; today&apos;s bar is still filling in.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Breakdown</h2>
              <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                {(['team', 'key', 'model', 'connection'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBreakdown(id)}
                    className={cn(
                      'rounded-md px-2.5 py-1 capitalize',
                      breakdown === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>

            {breakdown !== 'team' ? (
              <p className="mt-4 text-sm text-slate-500">
                Showing team / member breakdown for now. Key / model / connection views will use the same CPC
                usage API.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-2 font-medium">Team</th>
                      <th className="pb-2 font-medium">Spent</th>
                      <th className="pb-2 font-medium">Of team budget</th>
                      <th className="pb-2 font-medium">Requests</th>
                      <th className="pb-2 font-medium">Tool calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usage.teamRows.map((row) => {
                      const share = Math.round((row.spent / Math.max(row.budget, 1)) * 100)
                      return (
                        <tr key={row.team} className={cn(row.alert && 'bg-amber-50/60')}>
                          <td className="py-3 pr-3">
                            <p className="font-medium text-slate-900">{row.team}</p>
                            {row.alert ? <p className="text-xs text-rose-600">{row.alert}</p> : null}
                          </td>
                          <td className="py-3 pr-3 tabular-nums">${row.spent}</td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={cn('h-full rounded-full', row.alert ? 'bg-amber-500' : 'bg-sky-600')}
                                  style={{ width: `${Math.min(100, share)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500">
                                {share}% of ${row.budget.toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 tabular-nums">{row.requests.toLocaleString()}</td>
                          <td className="py-3 tabular-nums">{row.toolCalls.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Limits in place</h2>
              <button
                type="button"
                className="text-xs font-medium text-sky-700 hover:underline"
                onClick={() => setTab('payment')}
              >
                Edit in Payment & limits
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <strong className="text-slate-800">Org budget:</strong> $
                {usage.monthBudget.toLocaleString()} a month. Alerts at 80% and 100%; requests keep running past
                it.
              </li>
              <li>
                <strong className="text-slate-800">Team budgets:</strong> {usage.teamRows.length} rows in the
                breakdown above.
              </li>
              <li>
                <strong className="text-slate-800">Daily caps per key:</strong> Soft UI caps on create; hard
                enforcement follows metering.
              </li>
            </ul>
          </section>
        </div>
      ) : null}
    </PageChrome>
  )
}

function PlanCreditsPanel({
  portalBusy,
  onOpenPortal,
  poolNote,
}: {
  portalBusy: boolean
  onOpenPortal: () => void
  poolNote?: string
}) {
  return (
    <div className="space-y-4" data-testid="usage-plan">
      {poolNote ? <p className="text-xs text-slate-500">{poolNote}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Current plan: <span className="text-slate-900">{PLAN_CREDITS.planName}</span>
              </h2>
              <p className="mt-1 text-sm text-slate-500">{PLAN_CREDITS.renews}</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={portalBusy} onClick={onOpenPortal}>
              Compare plans
            </Button>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>
              <strong className="text-slate-800">Members:</strong> {PLAN_CREDITS.members}
            </li>
            <li>
              <strong className="text-slate-800">Model usage:</strong> {PLAN_CREDITS.modelUsage}
            </li>
            <li>
              <strong className="text-slate-800">Included:</strong> {PLAN_CREDITS.included}
            </li>
            <li>
              <strong className="text-slate-800">Audit retention:</strong> {PLAN_CREDITS.auditRetention}
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Prepaid credits</h2>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{PLAN_CREDITS.creditBalance}</p>
          <p className="mt-2 text-sm text-slate-500">{PLAN_CREDITS.creditNote}</p>
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" defaultChecked={PLAN_CREDITS.autoTopUp} className="mt-1" />
            <span>Top up automatically below $100</span>
          </label>
          <div className="mt-4">
            <Button type="button" disabled={portalBusy} onClick={onOpenPortal} data-testid="open-stripe-portal">
              {portalBusy ? 'Opening…' : 'Add credits'}
            </Button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Invoices</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2 font-medium">Period</th>
              <th className="pb-2 font-medium">Amount</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PLAN_CREDITS.invoices.map((inv) => (
              <tr key={inv.period}>
                <td className="py-3 text-slate-800">{inv.period}</td>
                <td className="py-3 text-slate-600">{inv.amount}</td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={inv.statusTone} />
                    {inv.status}
                  </span>
                  {inv.extra === 'PDF' ? (
                    <button type="button" className="ml-2 text-sky-700 hover:underline">
                      PDF
                    </button>
                  ) : (
                    <span className="ml-2 text-xs text-slate-400">{inv.extra}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function PaymentLimitsPanel({
  portalBusy,
  onOpenPortal,
  monthBudget,
  forecast,
}: {
  portalBusy: boolean
  onOpenPortal: () => void
  monthBudget: number
  forecast: number
}) {
  return (
    <div className="space-y-4" data-testid="usage-payment">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Payment</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-700">{PAYMENT_LIMITS.card}</span>
            <button
              type="button"
              className="font-medium text-sky-700 hover:underline"
              disabled={portalBusy}
              onClick={onOpenPortal}
            >
              Change
            </button>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-700">
              Invoices go to <strong>{PAYMENT_LIMITS.invoiceEmail}</strong>
            </span>
            <button
              type="button"
              className="font-medium text-sky-700 hover:underline"
              disabled={portalBusy}
              onClick={onOpenPortal}
            >
              Change
            </button>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-700">
              Tax ID: <span className="text-slate-500">{PAYMENT_LIMITS.taxId}</span>
            </span>
            <button
              type="button"
              className="font-medium text-sky-700 hover:underline"
              disabled={portalBusy}
              onClick={onOpenPortal}
            >
              Add
            </button>
          </li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Payments are handled by Stripe. ClawQL never sees your full card number.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Org limit</h2>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
          <strong>October is forecast at about ${forecast.toLocaleString()}.</strong> With alerts only, spending
          keeps going past the ${monthBudget.toLocaleString()} budget. Turn on a hard stop if that shouldn&apos;t
          happen.
        </div>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-800">Monthly budget</span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-slate-500">$</span>
            <input
              type="number"
              defaultValue={monthBudget}
              className="h-9 w-32 rounded-lg border border-slate-200 px-3"
            />
            <span className="text-xs text-slate-500">for the whole organization</span>
          </div>
        </label>
        <p className="mt-3 text-sm text-slate-600">
          <strong className="text-slate-800">Alerts:</strong> {PAYMENT_LIMITS.alerts} to admins via email and
          Slack.
        </p>
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-800">At 100%</p>
          <div className="mt-2 flex rounded-lg border border-slate-200 p-0.5 text-sm">
            <button
              type="button"
              className="flex-1 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white"
            >
              Alert only
            </button>
            <button type="button" className="flex-1 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              Hard stop
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            A hard stop pauses model calls while keeping tools and approvals functional.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Team budgets</h2>
          <p className="text-xs text-slate-500">
            Daily caps per key are set on each key in{' '}
            <a href="/connections" className="text-sky-700 hover:underline">
              Connections & keys
            </a>
            .
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PAYMENT_LIMITS.teamBudgets.map((row) => (
            <label key={row.team} className="block text-sm">
              <span className="font-medium text-slate-800">{row.team}</span>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  defaultValue={row.amount}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3"
                />
              </div>
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Changes to limits are recorded in the audit log.</p>
          <Button type="button">Save limits</Button>
        </div>
      </section>
    </div>
  )
}
