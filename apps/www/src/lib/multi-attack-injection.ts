/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * Not a live category claim yet (publish gate — Obot still pending Docker).
 */

export const multiAttackHeadline = 'Multi-attack injection — smoke (draft)'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — this measures whether the gateway stops the resulting action, not whether a real model would fall for it. Sample size: smoke until the suite grows to dozens. Benign workflows are scored beside attacks. Peers front a shared Obsidian-compatible Memory/ vault (none ship a built-in vault).'

export const multiAttackHeadlineResult =
  'Smoke v4c: ClawQL default 0/12; Bifrost/Executor defaults 12/12 (passthrough-equivalent loss on Obsidian equal-arm vault); Bifrost/Executor best-config 0/12 via tool deny; Obot pending (Docker). Persistent + recall integrity + benign expect-match still green.'

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

/** Regenerate via npm run benchmark:multi-attack-injection:peers */
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
    note: 'Direct Obsidian Memory/ vault-mcp (no gateway)',
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
    note: 'Docker required for ci-obot-peer.sh — pending ≠ not_offered',
  },
  {
    arm: 'Obot best-config',
    column: 'best_config',
    status: 'pending',
    effectuated: '—',
    note: 'Wire OBOT_MCP_URL_DENY after Docker Obot bootstrap',
  },
  {
    arm: 'Bifrost default',
    column: 'defaults',
    status: 'measured',
    effectuated: '12 / 12',
    note: 'Allow-all VK → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Bifrost best-config',
    column: 'best_config',
    status: 'measured',
    effectuated: '0 / 12',
    note: 'VK omits memory_ingest',
  },
  {
    arm: 'Executor default',
    column: 'defaults',
    status: 'measured',
    effectuated: '12 / 12',
    note: 'Code-mode execute → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Executor best-config',
    column: 'best_config',
    status: 'measured',
    effectuated: '0 / 12',
    note: 'DENY_TOOLS stand-in (no built-in Obsidian vault deny)',
  },
] as const

export const multiAttackPublishGate =
  'Draft until Obot is measured (Docker) and live matrix leaves scaffold. Bifrost/Executor defaults show equal-arm loss on the shared Obsidian vault; ClawQL default stays 0/12 via general mechanisms — not tool-name deny.'

export const multiAttackBenignSummary =
  'Benign suite includes the outbound boundary: reply-to-sender and internal team/reviewer destinations complete; third-party notify stays blocked. Contamination = hostile content surfaced as trusted (same as the governance board).'
