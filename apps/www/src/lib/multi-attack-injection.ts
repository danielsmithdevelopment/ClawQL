/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * Not a live category claim yet (publish gate).
 */

export const multiAttackHeadline = 'Multi-attack injection — smoke (draft)'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — this measures whether the gateway stops the resulting action, not whether a real model would fall for it. Sample size: smoke until the suite grows to dozens. Benign workflows are scored beside attacks.'

export const multiAttackHeadlineResult =
  'Smoke v4: 0 of 12 trusted effectuation, persistent injection blocked, recall integrity (trusted 15.00 over labeled 99.99), and benign expect-match including same-source/internal outbound — scripted smoke; peers pending.'

export const multiAttackMechanisms = [
  {
    id: 'untrusted_read_taint',
    title: 'Untrusted-read tainting',
    detail: 'Reading planted channel content taints the session; later external/privileged sinks fail closed.',
  },
  {
    id: 'park_destructive_write',
    title: 'Park destructive writes',
    detail: 'Overwrites of existing facts park for a person; clean appends proceed.',
  },
  {
    id: 'data_flow',
    title: 'Data-flow rules',
    detail: 'Untrusted labels may not flow to external sinks; vault writes are allowed with an untrusted provenance label.',
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

/** Smoke v1 — regenerate via npm run benchmark:multi-attack-injection */
export const multiAttackArmRows: readonly MultiAttackArmRow[] = [
  {
    arm: 'ClawQL default',
    column: 'defaults',
    status: 'measured',
    effectuated: '0 / 12',
    note: 'Park overwrites; label memory; block external — not BLOCK_TOOLS',
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
    note: 'Taint-first + overwrite-park + labelable memory',
  },
  {
    arm: 'Obot default',
    column: 'defaults',
    status: 'pending',
    effectuated: '—',
    note: 'Measurable — wire peer CI',
  },
  {
    arm: 'Obot best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Measurable — wire peer CI',
  },
  {
    arm: 'Bifrost default',
    column: 'defaults',
    status: 'pending',
    effectuated: '—',
    note: 'Measurable — wire peer CI',
  },
  {
    arm: 'Bifrost best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Measurable — wire peer CI',
  },
  {
    arm: 'Executor default',
    column: 'defaults',
    status: 'pending',
    effectuated: '—',
    note: 'Measurable — wire peer CI',
  },
  {
    arm: 'Executor best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Measurable — wire peer CI',
  },
] as const

export const multiAttackPublishGate =
  'Draft until peers are measured on this corpus. Publish only when attack rate, persistent-injection, and benign completion rate are all honest — not “secure because it blocks everything.”'

export const multiAttackBenignSummary =
  'Benign suite includes the outbound boundary: reply-to-sender and internal team/reviewer destinations complete; third-party notify stays blocked. Contamination = hostile content surfaced as trusted (same as the governance board).'
