'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { REVIEW_ITEMS, type ReviewKind } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

type Filter = 'all' | ReviewKind

export function ReviewPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState(REVIEW_ITEMS[0]!.id)
  const [onlyMine, setOnlyMine] = useState(true)

  const filtered = useMemo(
    () => REVIEW_ITEMS.filter((i) => filter === 'all' || i.kind === filter),
    [filter],
  )
  const selected = filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? REVIEW_ITEMS[0]!

  return (
    <PageChrome
      crumbs={['Review']}
      title="Review"
      description="Everything waiting on a person: changes agents want to make, sources they propose, decisions they weren't sure about, and skills ready to promote."
    >
      <TabBar
        testIdPrefix="review-tab"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'all', label: 'All', count: REVIEW_ITEMS.length },
          { id: 'change', label: 'Changes', count: 1 },
          { id: 'source', label: 'New sources', count: 1 },
          { id: 'decision', label: 'Decisions', count: 1 },
          { id: 'skill', label: 'Skills', count: 1 },
        ]}
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
        Only what I can approve
      </label>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        <div>
          <ul className="space-y-2">
            {filtered.map((item) => {
              const active = item.id === selected.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
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
          <ReviewDetail item={selected} />
        </div>
      </div>
    </PageChrome>
  )
}

function ReviewDetail({ item }: { item: (typeof REVIEW_ITEMS)[number] }) {
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
          <Button type="button">Promote with security key</Button>
          <Button type="button" variant="outline">
            Decline
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Once active, it&apos;s re-reviewed on Jan 3, 2027, or sooner if its behavior drifts.
        </p>
      </>
    )
  }

  if (item.kind === 'change') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            MEDIUM risk
          </span>
          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
            Expires in 11 min
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Requested by legal-ops agent in session{' '}
          <Link href="/sessions" className="font-mono text-sky-700 hover:underline">
            sess_7f2a91c4
          </Link>
          , run by Priya Shah in Claude Code, 18 minutes ago.
        </p>
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
              <StatusDot tone="ok" className="mt-1.5" /> Value matches Amendment 2, clause 4
            </li>
            <li className="flex gap-2">
              <StatusDot tone="warn" className="mt-1.5" /> Policy: 1 approver with a security key, never the
              requester
            </li>
          </ul>
        </section>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button">Approve with security key</Button>
          <Button type="button" variant="outline">
            Decline
          </Button>
        </div>
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
          <Button type="button">Submit answer</Button>
          <Button type="button" variant="outline">
            Skip for now
          </Button>
          <Button type="button" variant="ghost">
            Ask a teammate
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
      <p className="mt-2 text-sm text-slate-600">
        support-bot proposed adding Linear after a ticket needed fields ClawQL can&apos;t reach yet. Spec scanned by
        Panguard with no known attack patterns.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
        <li className="flex gap-2">
          <StatusDot tone="ok" className="mt-1.5" /> Spec scanned — no known attack patterns
        </li>
        <li className="flex gap-2">
          <StatusDot tone="ok" className="mt-1.5" /> Host linear.app will be added to allowed outbound hosts
        </li>
        <li className="flex gap-2">
          <StatusDot tone="warn" className="mt-1.5" /> Needs a source approver with a security key
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button">Approve with security key</Button>
        <Button type="button" variant="outline">
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
