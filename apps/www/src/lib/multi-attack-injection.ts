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
  'After native-tool governance: ClawQL defaults stop the twelve attacks via park/IFC (not a tool-name deny). Report benign completion cost alongside — “0 of 12” alone is not the claim.'

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
  'Draft until peers are measured on this corpus. Always publish attack rate beside benign completed-without-human.'

export const multiAttackBenignSummary =
  'Benign suite (defaults): recall + search complete without a human; clean memory_ingest parks for approval; email-then-summary is blocked by taint/data-flow.'
