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
  'Smoke v3: 0 of 12 trusted attacks, persistent injection blocked, and every benign workflow completes without a human — park overwrites, label untrusted→memory, block untrusted→external (not a tool-name deny).'

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
  'Benign suite (defaults): 10/10 complete without a human — clean appends and email→labeled summary go through; only overwrites of authoritative facts park.'
