'use client'

import { useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import { SKILLS, type SkillStage } from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

export function SkillsPage() {
  const [stage, setStage] = useState<SkillStage>('proving')
  const filtered = useMemo(() => SKILLS.filter((s) => s.stage === stage), [stage])
  const [selectedId, setSelectedId] = useState(filtered[0]?.id ?? SKILLS[0]!.id)
  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? SKILLS[0]!

  const counts = {
    active: SKILLS.filter((s) => s.stage === 'active').length,
    proving: SKILLS.filter((s) => s.stage === 'proving').length,
    proposed: SKILLS.filter((s) => s.stage === 'proposed').length,
    retired: SKILLS.filter((s) => s.stage === 'retired').length,
  }

  return (
    <PageChrome
      crumbs={['Skills']}
      title="Skills"
      description="Reusable procedures your agents have learned or your team has written. Every skill proves itself before it's trusted, and stays sandboxed after."
      actions={<Button type="button">Add a skill</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        <p>
          How a skill earns trust:{' '}
          <span className="font-medium text-slate-800">Proposed → Being proven → Review → Active</span>
        </p>
        <p className="text-xs text-slate-500">Any code change starts it over. Drift or expiry retires it.</p>
      </div>

      <TabBar
        testIdPrefix="skills-tab"
        value={stage}
        onChange={(id) => {
          setStage(id)
          const next = SKILLS.find((s) => s.stage === id)
          if (next) setSelectedId(next.id)
        }}
        tabs={[
          { id: 'active', label: 'Active', count: counts.active || 12 },
          { id: 'proving', label: 'Being proven', count: counts.proving },
          { id: 'proposed', label: 'Proposed', count: counts.proposed || 5 },
          { id: 'retired', label: 'Retired', count: counts.retired || 4 },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        <ul className="space-y-2">
          {filtered.map((skill) => (
            <li key={skill.id}>
              <button
                type="button"
                onClick={() => setSelectedId(skill.id)}
                data-testid={`skill-${skill.id}`}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                  skill.id === selected.id
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-slate-900">{skill.name}</p>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                      skill.badgeTone === 'ok' && 'bg-emerald-100 text-emerald-800',
                      skill.badgeTone === 'warn' && 'bg-amber-100 text-amber-800',
                      skill.badgeTone === 'danger' && 'bg-rose-100 text-rose-800',
                      skill.badgeTone === 'neutral' && 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {skill.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{skill.summary}</p>
              </button>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-lg font-semibold text-slate-900">{selected.name}</h2>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    selected.badgeTone === 'ok' && 'bg-emerald-100 text-emerald-800',
                    selected.badgeTone === 'warn' && 'bg-amber-100 text-amber-800',
                    selected.badgeTone === 'danger' && 'bg-rose-100 text-rose-800',
                    selected.badgeTone === 'neutral' && 'bg-slate-200 text-slate-700',
                  )}
                >
                  {selected.badge}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{selected.description}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline">
                View code
              </Button>
              {selected.stage === 'proving' && selected.badgeTone === 'ok' ? (
                <Button type="button">Send to Review</Button>
              ) : null}
            </div>
          </div>

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">What it&apos;s allowed to do</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {[
                ['Reads', 'memory_recall, crm.contracts.get, the document pipeline'],
                ['Writes', 'adjust_contract_value, always with a mandate'],
                ['Network', 'Nothing outside your gateway'],
                ['Data', 'Internal data, written only to your CRM'],
                ['Spend', 'Up to $2 per run'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs font-medium text-slate-500">{k}</dt>
                  <dd className="text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              The sandbox enforces this at runtime. Anything not listed is denied, even after promotion.
            </p>
          </section>

          {selected.badgeTone === 'ok' ? (
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Evidence</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                {[
                  'Held-out tasks: 19 of 20 amendments reconciled correctly.',
                  'Stayed in bounds across all 20 runs.',
                  'Adversarial runs: 12 tool results with injected instructions; never left its bounds.',
                  'Code checks: type-checks with authorization proofs, strict lint clean, no new dependencies, no secrets.',
                  'Instructions scanned: Panguard found no known attack patterns.',
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <StatusDot tone="ok" className="mt-1.5" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
                <strong className="text-slate-800">Independent review, advisory:</strong> a model from a different
                family read the code. &quot;Does what it says. The riskiest step is the value change, and that always
                waits for a mandate.&quot;
              </div>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Because it writes, promotion needs a contract approver with a security key. Once active, it&apos;s
                re-reviewed every 90 days.
              </p>
            </section>
          ) : selected.badgeTone === 'danger' ? (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Failed a check: reached an undeclared host in 1 adversarial run. Fix the skill and re-run proving.
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Evidence still gathering. {selected.badge}.
            </div>
          )}
        </div>
      </div>
    </PageChrome>
  )
}
