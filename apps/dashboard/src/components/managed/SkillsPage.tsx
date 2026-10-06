'use client'

import { useMemo, useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { TabBar } from '@/components/managed/TabBar'
import { Button } from '@/components/ui/button'
import {
  SKILLS,
  SKILLS_ACTIVE,
  SKILLS_PROPOSED,
  SKILLS_RETIRED,
  type SkillStage,
} from '@/lib/managed/fixtures-ops'
import { cn } from '@/lib/utils'

const CRUMB: Record<SkillStage, string> = {
  active: 'Active',
  proving: 'Being proven',
  proposed: 'Proposed',
  retired: 'Retired',
}

export function SkillsPage() {
  const [stage, setStage] = useState<SkillStage>('active')
  const proving = useMemo(() => SKILLS.filter((s) => s.stage === 'proving'), [])
  const [selectedId, setSelectedId] = useState(proving[0]?.id ?? SKILLS[0]!.id)
  const selected = proving.find((s) => s.id === selectedId) ?? proving[0] ?? SKILLS[0]!

  const counts = {
    active: SKILLS_ACTIVE.length,
    proving: proving.length,
    proposed: SKILLS_PROPOSED.length,
    retired: SKILLS_RETIRED.length,
  }

  return (
    <PageChrome
      crumbs={['Skills', CRUMB[stage]]}
      title="Skills"
      description="Reusable procedures your agents have learned or your team has written. Every skill proves itself before it's trusted, and stays sandboxed after."
      actions={<Button type="button">Add a skill</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        <span className="font-medium text-slate-800">How a skill earns trust:</span>
        {(
          [
            ['Proposed', 'bg-slate-100 text-slate-700'],
            ['Being proven', 'bg-amber-100 text-amber-900'],
            ['Review', 'bg-sky-100 text-sky-900'],
            ['Active', 'bg-emerald-100 text-emerald-800'],
          ] as const
        ).map(([label, cls], i) => (
          <span key={label} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-slate-300">→</span> : null}
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', cls)}>{label}</span>
          </span>
        ))}
        <span className="text-xs text-slate-500">Any code change starts it over. Drift or expiry retires it.</span>
      </div>

      <TabBar
        testIdPrefix="skills-tab"
        value={stage}
        onChange={(id) => {
          setStage(id)
          if (id === 'proving' && proving[0]) setSelectedId(proving[0].id)
        }}
        tabs={[
          { id: 'active', label: 'Active', count: counts.active },
          { id: 'proving', label: 'Being proven', count: counts.proving },
          { id: 'proposed', label: 'Proposed', count: counts.proposed },
          { id: 'retired', label: 'Retired', count: counts.retired },
        ]}
      />

      {stage === 'active' ? <ActiveSkillsPanel /> : null}
      {stage === 'proposed' ? <ProposedSkillsPanel /> : null}
      {stage === 'retired' ? <RetiredSkillsPanel /> : null}
      {stage === 'proving' ? (
        <ProvingSkillsPanel
          skills={proving}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
      ) : null}
    </PageChrome>
  )
}

function ActiveSkillsPanel() {
  return (
    <div className="space-y-3" data-testid="skills-active">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Skill</th>
              <th className="px-4 py-3 font-medium">Key group</th>
              <th className="px-4 py-3 font-medium">Touches</th>
              <th className="px-4 py-3 font-medium">Runs, 7 days</th>
              <th className="px-4 py-3 font-medium">Re-review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {SKILLS_ACTIVE.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <p className="font-mono text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.description}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.keyGroup}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-md px-2 py-0.5 text-xs font-medium',
                      row.touches === 'read'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900',
                    )}
                  >
                    {row.touchesLabel}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{row.runs7d}</td>
                <td className="px-4 py-3 text-slate-600">{row.rereview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Each skill runs sandboxed and can only touch what it was approved for. If its behavior drifts from what it
        showed during review, it&apos;s retired automatically and moves to Retired.
      </p>
    </div>
  )
}

function ProposedSkillsPanel() {
  return (
    <div className="space-y-4" data-testid="skills-proposed">
      <p className="text-sm text-slate-600">
        Agents propose a skill when they notice themselves repeating the same steps. Nothing here runs yet. Start
        proving to test it against held-out tasks and adversarial runs.
      </p>
      <ul className="space-y-3">
        {SKILLS_PROPOSED.map((skill) => (
          <li
            key={skill.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            data-testid={`proposed-${skill.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-mono text-sm font-semibold text-slate-900">{skill.name}</h3>
                <p className="mt-1 text-sm text-slate-700">{skill.description}</p>
                <p className="mt-1 text-xs text-slate-500">{skill.attribution}</p>
                {skill.blocker ? (
                  <span
                    className={cn(
                      'mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-medium',
                      skill.blockerTone === 'danger' && 'bg-rose-100 text-rose-800',
                      skill.blockerTone === 'warn' && 'bg-amber-100 text-amber-900',
                      skill.blockerTone === 'neutral' && 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {skill.blocker}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm">
                  Dismiss
                </Button>
                {skill.altAction && !skill.canProve ? (
                  <button type="button" className="text-sm font-medium text-sky-700 hover:underline">
                    {skill.altAction}
                  </button>
                ) : (
                  <Button type="button" size="sm" disabled={!skill.canProve}>
                    Start proving
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RetiredSkillsPanel() {
  return (
    <div className="space-y-3" data-testid="skills-retired">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Skill</th>
              <th className="px-4 py-3 font-medium">Why it was retired</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {SKILLS_RETIRED.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <p className="font-mono text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.keyGroup}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-md px-2 py-0.5 text-xs font-medium',
                      row.reasonTone === 'ok' && 'bg-emerald-100 text-emerald-800',
                      row.reasonTone === 'warn' && 'bg-amber-100 text-amber-900',
                      row.reasonTone === 'danger' && 'bg-rose-100 text-rose-800',
                      row.reasonTone === 'neutral' && 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {row.reasonLabel}
                  </span>
                  <p className="mt-1 text-sm text-slate-600">{row.reasonDetail}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.when}</td>
                <td className="px-4 py-3">
                  <button type="button" className="text-sky-700 hover:underline">
                    {row.nextStep}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        A retired skill can&apos;t run. Bringing one back means proving it again from the start, and its history
        stays in the audit log either way.
      </p>
    </div>
  )
}

function ProvingSkillsPanel({
  skills,
  selectedId,
  onSelect,
}: {
  skills: readonly (typeof SKILLS)[number][]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected = skills.find((s) => s.id === selectedId) ?? skills[0]!

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]" data-testid="skills-proving">
      <ul className="space-y-2">
        {skills.map((skill) => (
          <li key={skill.id}>
            <button
              type="button"
              onClick={() => onSelect(skill.id)}
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
            {selected.badgeTone === 'ok' ? <Button type="button">Send to Review</Button> : null}
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
        </section>

        {selected.badgeTone === 'ok' ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">Evidence</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              {[
                'Held-out tasks: 19 of 20 amendments reconciled correctly.',
                'Stayed in bounds across all 20 runs.',
                'Adversarial runs: 12 tool results with injected instructions; never left its bounds.',
                'Code checks: type-checks with authorization proofs, strict lint clean.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <StatusDot tone="ok" className="mt-1.5" />
                  {line}
                </li>
              ))}
            </ul>
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
  )
}
