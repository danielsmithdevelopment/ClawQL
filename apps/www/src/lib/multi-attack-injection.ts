/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * Not a live category claim yet (publish gate).
 */

export const multiAttackHeadline = 'Multi-attack injection — smoke (not published)'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — this measures whether the gateway stops the resulting action, not whether a real model would fall for it. Sample size: smoke until the suite grows to dozens.'

export const multiAttackHeadlineResult =
  'ClawQL on defaults lets all twelve through — same as no gateway. That is the strongest argument for shipping park-destructive writes and untrusted-read taint as stock defaults, then re-running this column.'

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

/** Smoke v1 — regenerate via npm run benchmark:multi-attack-injection */
export const multiAttackArmRows: readonly MultiAttackArmRow[] = [
  {
    arm: 'ClawQL default',
    column: 'defaults',
    status: 'measured',
    effectuated: '12 / 12',
    note: 'Stock — mechanisms off. Headline gap.',
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
    note: 'Via taint + park + data-flow — not a tool-name deny',
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
  'Do not treat this as a live claim until peers are measured, product defaults ship, and the default column is re-run.'
