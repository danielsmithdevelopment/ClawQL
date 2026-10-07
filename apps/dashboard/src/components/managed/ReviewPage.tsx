'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { decideManagedReview, fetchManagedReview } from '@/lib/managed/client'
import {
  APPROVAL_POLICIES,
  APPROVAL_POLICY_DETAIL,
  REVIEW_ITEMS,
  type ReviewItem,
  type ReviewKind,
} from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Section = 'queue' | 'policies'
type Filter = 'all' | ReviewKind

export function ReviewPage() {
  const [section, setSection] = useState<Section>('queue')
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<ReviewItem[]>(() => [...REVIEW_ITEMS])
  const [source, setSource] = useState<'live' | 'fixture'>('fixture')
  const [selectedId, setSelectedId] = useState(REVIEW_ITEMS[0]!.id)
  const [policyId, setPolicyId] = useState(APPROVAL_POLICIES[0]!.id)
  const [onlyMine, setOnlyMine] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchManagedReview()
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setSource(res.source)
        if (res.items[0]) setSelectedId(res.items[0].id)
      })
      .catch(() => {
        /* keep fixture seed */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const byKind = { change: 0, source: 0, decision: 0, skill: 0 }
    for (const i of items) byKind[i.kind] += 1
    return byKind
  }, [items])

  const filtered = useMemo(
    () => items.filter((i) => filter === 'all' || i.kind === filter),
    [filter, items],
  )
  const selected = filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? items[0]

  const decide = async (
    decision: 'approve' | 'decline' | 'mark_applied' | 'mark_not_applied' | 'retry_with_key',
  ) => {
    if (!selected || (selected.kind !== 'change' && selected.kind !== 'source')) {
      setActionError('This review kind is fixture-only until its backend lands.')
      return
    }
    setBusyId(selected.id)
    setActionError(null)
    setActionNote(null)
    try {
      const res = await decideManagedReview({
        id: selected.id,
        kind: selected.kind,
        decision,
      })
      const leaveInQueue = decision === 'retry_with_key'
      if (!leaveInQueue) {
        setItems((prev) => prev.filter((i) => i.id !== selected.id))
      }
      const labels: Record<typeof decision, string> = {
        approve: 'Approved',
        decline: 'Declined',
        mark_applied: 'Marked applied',
        mark_not_applied: 'Marked not applied',
        retry_with_key: 'Keyed retry authorized',
      }
      setActionNote(`${labels[decision]} · ${res.status}`)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const selectedPolicy =
    APPROVAL_POLICIES.find((p) => p.id === policyId) ?? APPROVAL_POLICIES[0]!

  return (
    <PageChrome
      crumbs={section === 'policies' ? ['Review', 'Approval policies'] : ['Review']}
      title="Review"
      description={
        section === 'policies'
          ? "The rules for what waits on a person. Agents can't edit or skip them, and every change is recorded."
          : "Everything waiting on a person: changes agents want to make, sources they propose, decisions they weren't sure about, and skills ready to promote."
      }
      actions={
        section === 'policies' ? (
          <Button type="button">New rule</Button>
        ) : undefined
      }
    >
      <TabBar
        testIdPrefix="review-section"
        value={section}
        onChange={setSection}
        tabs={[
          { id: 'queue', label: 'Queue', count: items.length },
          { id: 'policies', label: 'Approval policies' },
        ]}
      />

      {section === 'policies' ? (
        <ApprovalPoliciesPanel selectedId={selectedPolicy.id} onSelect={setPolicyId} />
      ) : null}

      {section === 'queue' ? (
        <>
      <p className="mb-3 text-xs text-slate-500" data-testid="review-data-source">
        Review source:{' '}
        {source === 'live'
          ? 'Pending executions + source proposals ($CLAWQL_HOME)'
          : 'Acme fixture — empty pending dirs fall back here'}
      </p>

      <TabBar
        testIdPrefix="review-tab"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'all', label: 'All', count: items.length },
          { id: 'change', label: 'Changes', count: counts.change },
          { id: 'source', label: 'New sources', count: counts.source },
          { id: 'decision', label: 'Decisions', count: counts.decision },
          { id: 'skill', label: 'Skills', count: counts.skill },
        ]}
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
        Only what I can approve
      </label>

      {actionError ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionNote ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {actionNote}
        </p>
      ) : null}

      {!selected ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">Nothing waiting</p>
          <p className="mt-1 text-sm text-slate-500">New pending changes and sources will show up here.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
          <div>
            <ul className="space-y-2">
              {filtered.map((item) => {
                const active = item.id === selected.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id)
                        setActionError(null)
                        setActionNote(null)
                      }}
                      data-testid={`review-item-${item.id}`}
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                        active
                          ? 'border-amber-200 bg-amber-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {item.kindLabel}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                            item.badgeTone === 'ok' && 'bg-emerald-100 text-emerald-800',
                            item.badgeTone === 'warn' && 'bg-amber-100 text-amber-800',
                            item.badgeTone === 'danger' && 'bg-rose-100 text-rose-800',
                            item.badgeTone === 'neutral' && 'bg-slate-200 text-slate-700',
                          )}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.listMeta}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                        <StatusDot tone={item.statusTone} />
                        {item.statusLine}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Decided requests move to the audit log.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
            <ReviewDetail
              item={selected}
              source={source}
              busy={busyId === selected.id}
              onDecide={(d) => void decide(d)}
            />
          </div>
        </div>
      )}
        </>
      ) : null}
    </PageChrome>
  )
}

function ApprovalPoliciesPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected = APPROVAL_POLICIES.find((p) => p.id === selectedId) ?? APPROVAL_POLICIES[0]!
  const detail = selected.id === APPROVAL_POLICY_DETAIL.id ? APPROVAL_POLICY_DETAIL : null

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Who approves</th>
              <th className="px-4 py-3 font-medium">Approvals</th>
              <th className="px-4 py-3 font-medium">Security key</th>
              <th className="px-4 py-3 font-medium">Waits up to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {APPROVAL_POLICIES.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'cursor-pointer hover:bg-slate-50/80',
                  row.id === selected.id && 'bg-amber-50/50',
                )}
                onClick={() => onSelect(row.id)}
                data-testid={`policy-${row.id}`}
              >
                <td className="px-4 py-3">
                  {row.blocked ? (
                    <div>
                      <p className="font-medium text-slate-900">{row.when}</p>
                      <span className="mt-1 inline-block rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                        Always blocked
                      </span>
                      {row.blockedNote ? (
                        <p className="mt-1 max-w-md text-xs text-slate-500">{row.blockedNote}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-slate-900">{row.when}</p>
                      {row.whenDetail ? <p className="text-xs text-slate-500">{row.whenDetail}</p> : null}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.who}</td>
                <td className="px-4 py-3 text-slate-700">{row.approvals}</td>
                <td className="px-4 py-3 text-slate-700">{row.securityKey}</td>
                <td className="px-4 py-3 text-slate-700">{row.waits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!selected.blocked && detail ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{detail.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{detail.lastChanged}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(
              [
                ['Applies to', detail.appliesTo, detail.appliesHelp],
                ['Who approves', detail.whoApproves, detail.whoHelp],
                ['Approvals needed', detail.approvalsNeeded, ''],
                ['Expires after', detail.expiresAfter, detail.expiresHelp],
              ] as const
            ).map(([label, value, help]) => (
              <label key={label} className="block text-sm font-medium text-slate-800">
                {label}
                <select
                  className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal"
                  defaultValue={value}
                >
                  <option>{value}</option>
                </select>
                {help ? <p className="mt-1 text-xs font-normal text-slate-500">{help}</p> : null}
              </label>
            ))}
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            <li className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <p className="font-medium text-slate-900">Require a security key</p>
                <p className="text-xs text-slate-500">A device-bound key, signing the exact change.</p>
              </div>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                On
              </span>
            </li>
            <li className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div>
                <p className="font-medium text-slate-900">The requester can&apos;t approve</p>
                <p className="text-xs text-slate-500">Always on. It can&apos;t be turned off for any rule.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                Locked on
              </span>
            </li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="font-medium text-slate-900">Notify approvers</p>
              <p className="text-sm text-slate-700">{detail.notify}</p>
              <p className="text-xs text-slate-500">Each person also chooses how in their profile.</p>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Saving a policy change needs your security key, and it&apos;s recorded in the audit log.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline">
                Discard
              </Button>
              <Button type="button">Save with security key</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReviewDetail({
  item,
  source,
  busy,
  onDecide,
}: {
  item: ReviewItem
  source: 'live' | 'fixture'
  busy: boolean
  onDecide: (
    decision: 'approve' | 'decline' | 'mark_applied' | 'mark_not_applied' | 'retry_with_key',
  ) => void
}) {
  if (item.kind === 'skill') {
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Skill promotion</p>
            <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Learned from 6 sessions by legal-ops agent.{' '}
              <Link href="/skills" className="text-sky-700 hover:underline">
                Open in Skills
              </Link>
            </p>
          </div>
        </div>
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">What approving does</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Skill becomes Active and can run without asking each time.</li>
            <li>It stays sandboxed — only the listed reads, writes, network, and spend.</li>
            <li>Any later code change sends it back to proving.</li>
          </ul>
        </section>
        <PermissionsBlock />
        <section className="mt-5">
          <p className="text-sm font-semibold text-slate-900">
            Evidence · <span className="font-normal text-emerald-700">All 5 checks passed</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              '19 of 20 held-out tasks',
              'Stayed in bounds, 20 runs',
              '12 of 12 adversarial runs',
              'Code checks clean',
              'Instructions scanned',
            ].map((pill) => (
              <span key={pill} className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                {pill}
              </span>
            ))}
          </div>
        </section>
        <p className="mt-4 text-xs text-slate-500">
          Policy: one contract approver, with a security key, who isn&apos;t the proposer. You qualify.
        </p>
        <label className="mt-4 block text-sm text-slate-700">
          Note for the audit log (optional)
          <input
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm"
            placeholder="Promoting after evidence review"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled>
            Promote with security key
          </Button>
          <Button type="button" variant="outline" disabled>
            Decline
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Skill promotion stays fixture-only until the skills registry API is wired.
        </p>
      </>
    )
  }

  if (item.kind === 'change') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
              item.badgeTone === 'danger' && 'bg-rose-100 text-rose-800',
              item.badgeTone === 'warn' && 'bg-amber-100 text-amber-800',
              item.badgeTone === 'neutral' && 'bg-slate-100 text-slate-700',
              item.badgeTone === 'ok' && 'bg-emerald-100 text-emerald-800',
            )}
          >
            {item.badge}
          </span>
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
              item.statusTone === 'danger' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700',
            )}
          >
            {item.statusLine}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {source === 'live' ? (
            <>
              Pending execution <span className="font-mono text-sky-700">{item.id}</span>. {item.listMeta}.
            </>
          ) : (
            <>
              Requested by legal-ops agent in session{' '}
              <Link href="/sessions" className="font-mono text-sky-700 hover:underline">
                sess_7f2a91c4
              </Link>
              , run by Priya Shah in Claude Code, 18 minutes ago.
            </>
          )}
        </p>
        {source === 'fixture' ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">The exact change</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1 font-medium">Field</th>
                  <th className="py-1 font-medium">Now</th>
                  <th className="py-1 font-medium">After approval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2">Contract</td>
                  <td className="py-2 font-mono text-xs">Northwind MSA ct_4471</td>
                  <td className="py-2 text-slate-400">—</td>
                </tr>
                <tr>
                  <td className="py-2">Annual value</td>
                  <td className="py-2">$48,500.00</td>
                  <td className="py-2 font-semibold text-slate-900">$52,000.00</td>
                </tr>
                <tr>
                  <td className="py-2">Effective</td>
                  <td className="py-2">Jan 1, 2026</td>
                  <td className="py-2 font-semibold text-slate-900">Nov 1, 2026</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              adjust_contract_value via crm.contracts · digest 4e7c…91ab
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Approving resumes the parked execution; declining rejects it. Two-party rules still apply on the
            gateway.
          </section>
        )}
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">Checks</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li className="flex gap-2">
              <StatusDot tone="ok" className="mt-1.5" /> Panguard: no known attack patterns
            </li>
            <li className="flex gap-2">
              <StatusDot tone="ok" className="mt-1.5" /> Information flow: internal data to CRM, allowed
            </li>
            <li className="flex gap-2">
              <StatusDot tone="warn" className="mt-1.5" /> Policy: 1 approver with a security key, never the
              requester
            </li>
          </ul>
        </section>
        {item.changeStatus === 'outcome_unknown' ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-slate-600">
              Consumed more than 60s ago with no finalize. Do not silent-retry.
              {item.idempotencyKey ? (
                <>
                  {' '}
                  Key: <span className="font-mono text-xs text-sky-800">{item.idempotencyKey}</span>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => onDecide('mark_applied')}
                data-testid="review-mark-applied"
              >
                {busy ? 'Working…' : 'Mark applied'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onDecide('mark_not_applied')}
                data-testid="review-mark-not-applied"
              >
                Mark not applied
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !item.idempotencyCapable}
                onClick={() => onDecide('retry_with_key')}
                data-testid="review-retry-with-key"
                title={
                  item.idempotencyCapable
                    ? 'Authorize re-drive with Idempotency-Key'
                    : 'Connector is not idempotency-capable'
                }
              >
                Retry with key
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => onDecide('approve')} data-testid="review-approve">
              {busy ? 'Working…' : 'Approve with security key'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onDecide('decline')}
              data-testid="review-decline"
            >
              Decline
            </Button>
          </div>
        )}
      </>
    )
  }

  if (item.kind === 'decision') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
            Decision site: ticket-triage
          </span>
        </div>
        <blockquote className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Ticket #48213: “I was charged twice for October — can you fix this?”
        </blockquote>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ['Billing question', '0.48'],
            ['Refund request', '0.44'],
            ['Account access', '0.05'],
            ['Other', '0.03'],
          ].map(([label, score]) => (
            <label
              key={label}
              className={cn(
                'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm',
                label === 'Refund request' ? 'border-slate-900 bg-slate-50' : 'border-slate-200',
              )}
            >
              <span>
                <input type="radio" name="decision" defaultChecked={label === 'Refund request'} className="mr-2" />
                {label}
              </span>
              <span className="font-mono text-xs text-slate-500">{score}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-amber-800">Scores not calibrated yet · 112 of 300 labeled examples</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" disabled>
            Submit answer
          </Button>
          <Button type="button" variant="outline" disabled>
            Skip for now
          </Button>
          <Button type="button" variant="ghost" disabled>
            Ask a teammate
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Label Studio / decision HITL stays fixture-only in this slice.</p>
      </>
    )
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {source === 'live' ? (
          <>
            Source proposal <span className="font-mono text-sky-700">{item.id}</span>. {item.listMeta}.
          </>
        ) : (
          <>
            support-bot proposed adding Linear after a ticket needed fields ClawQL can&apos;t reach yet. Spec
            scanned by Panguard with no known attack patterns.
          </>
        )}
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
        <li className="flex gap-2">
          <StatusDot tone="ok" className="mt-1.5" /> Spec scanned — no known attack patterns
        </li>
        <li className="flex gap-2">
          <StatusDot tone="ok" className="mt-1.5" /> Host will be added to allowed outbound hosts on approve
        </li>
        <li className="flex gap-2">
          <StatusDot tone="warn" className="mt-1.5" /> Needs a source approver with a security key
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => onDecide('approve')} data-testid="review-approve">
          {busy ? 'Working…' : 'Approve with security key'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onDecide('decline')}
          data-testid="review-decline"
        >
          Decline
        </Button>
      </div>
    </>
  )
}

function PermissionsBlock() {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-slate-900">What it&apos;s allowed to do</h3>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {[
          ['Reads', 'memory_recall, crm.contracts.get, the document pipeline'],
          ['Writes', 'adjust_contract_value, with a mandate'],
          ['Network', 'Nothing outside your gateway'],
          ['Data', 'Internal, written only to your CRM'],
          ['Spend', 'Up to $2 per run'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs font-medium text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
