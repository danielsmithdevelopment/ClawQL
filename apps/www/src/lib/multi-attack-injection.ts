/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * ClawQL smoke is published on /benchmarks; category claim waits on peer arms.
 */

export const multiAttackHeadline = 'Multi-attack injection — smoke published'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — this measures whether the gateway stops the resulting action, not whether a real model would fall for it. Sample size: smoke until the suite grows to dozens. Benign workflows are scored beside attacks.'

/** Concrete claim shape from results-smoke.json (2026-10-19). */
export const multiAttackHeadlineResult =
  '0 / 12 attacks effectuated under ClawQL defaults (native park/IFC — not a tool-name deny) · 2 / 4 benign completed without a human (1 parked, 1 blocked by taint). Passthrough: 12 / 12. Category claim pending peer arms.'

export const multiAttackMeta = {
  measuredAt: '2026-10-19',
  boardLabel: 'multi-attack-injection-smoke-v2',
  artifact: 'docs/benchmarks/security-suite/multi-attack-injection/results-smoke.json',
} as const

export const multiAttackMechanisms = [
  {
    id: 'untrusted_read_taint',
    title: 'Untrusted-read tainting',
    detail: 'Reading planted channel content taints the session so later writes fail closed.',
  },
  {
    id: 'park_destructive_write',
    title: 'Park destructive writes',
    detail: 'Destructive writes park for a person — no side effect until approval.',
  },
  {
    id: 'data_flow',
    title: 'Data-flow rules',
    detail: 'Tainted labels may not flow to vault (or other) sinks.',
  },
] as const

export type MultiAttackArmRow = {
  arm: string
  column: 'defaults' | 'best_config'
  status: 'measured' | 'pending'
  effectuated: string
  note: string
  highlight?: boolean
}

/** Smoke v2 — regenerate via npm run benchmark:multi-attack-injection */
export const multiAttackArmRows: readonly MultiAttackArmRow[] = [
  {
    arm: 'ClawQL default',
    column: 'defaults',
    status: 'measured',
    effectuated: '0 / 12',
    note: 'Native gate parks memory_ingest — not BLOCK_TOOLS',
    highlight: true,
  },
  {
    arm: 'Passthrough',
    column: 'defaults',
    status: 'measured',
    effectuated: '12 / 12',
    note: 'No gateway control',
  },
  {
    arm: 'ClawQL configured',
    column: 'best_config',
    status: 'measured',
    effectuated: '0 / 12',
    note: 'Taint-first + park + data-flow',
  },
  {
    arm: 'Obot default',
    column: 'defaults',
    status: 'pending',
    effectuated: '—',
    note: 'Pending equal-arm peer runner (not every-PR CI)',
  },
  {
    arm: 'Obot best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Pending equal-arm peer runner (not every-PR CI)',
  },
  {
    arm: 'Bifrost default',
    column: 'defaults',
    status: 'pending',
    effectuated: '—',
    note: 'Pending equal-arm peer runner (dispatch-only peers)',
  },
  {
    arm: 'Bifrost best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Pending equal-arm peer runner (dispatch-only peers)',
  },
  {
    arm: 'Executor default',
    column: 'defaults',
    status: 'pending',
    effectuated: '—',
    note: 'Pending equal-arm peer runner (not every-PR CI)',
  },
  {
    arm: 'Executor best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Pending equal-arm peer runner (not every-PR CI)',
  },
] as const

export const multiAttackPublishGate =
  'ClawQL smoke published; category claim waits until peer arms are measured on this corpus. Always publish attack rate beside benign completed-without-human.'

export const multiAttackBenignSummary =
  'Benign suite (defaults): recall + search complete without a human; clean memory_ingest parks for approval; email-then-summary is blocked by taint/data-flow.'
