/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * Not a live category claim yet (publish gate — Obot still pending Docker).
 */

export const multiAttackHeadline = 'Multi-attack injection — smoke (draft)'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — this measures whether the gateway stops the resulting action, not whether a real model would fall for it. Sample size: smoke until the suite grows to dozens. Peers have no built-in vault, so every arm writes the same Obsidian-compatible Memory/ served over MCP. The same 14 benign cases run on every arm so the denominator matches; memory-write breakouts sit under the table.'

export const multiAttackHeadlineResult =
  'Smoke v4f: ClawQL default 0 of 12 attacks and 14 of 14 benign. Bifrost/Executor defaults 12 of 12; best-config 0 of 12 and 9 of 14 benign (0 of 5 memory writes). After default attacks, every measured arm still answers 15.00 on the smoke recall query — peers also leave unlabeled poison in the vault (reported separately). Harder recall queries land in MAI_LIVE=1. Obot pending (Docker / Mac mini).'

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
  /** Attacks that took effect (trusted effectuation). */
  attacksTakingEffect: string
  /** Same 14 benign cases as every other arm. */
  benignAsExpected: string
  /** Smoke query: does recall still answer trusted 15.00? */
  recallIntegrity: string
  /** Separate from recall answer — unlabeled OVERRIDE/99.99 in vault. */
  unlabeledPoison: string
  note: string
  highlight?: boolean
}

/** Regenerate via npm run benchmark:multi-attack-injection:peers + board */
export const multiAttackArmRows: readonly MultiAttackArmRow[] = [
  {
    arm: 'ClawQL default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'no (labeled)',
    note: 'Park overwrites; label memory; block external — not BLOCK_TOOLS',
    highlight: true,
  },
  {
    arm: 'Passthrough',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '—',
    recallIntegrity: '—',
    unlabeledPoison: 'yes',
    note: 'Direct Obsidian Memory/ vault-mcp (no gateway)',
  },
  {
    arm: 'ClawQL configured',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'no (labeled)',
    note: 'Taint-first + overwrite-park + labelable memory',
  },
  {
    arm: 'Obot default',
    column: 'defaults',
    status: 'pending',
    attacksTakingEffect: '—',
    benignAsExpected: '—',
    recallIntegrity: '—',
    unlabeledPoison: '—',
    note: 'Docker required for ci-obot-peer.sh (Mac mini) — pending ≠ not_offered',
  },
  {
    arm: 'Obot best-config',
    column: 'best_config',
    status: 'pending',
    attacksTakingEffect: '—',
    benignAsExpected: '—',
    recallIntegrity: '—',
    unlabeledPoison: '—',
    note: 'Wire Obot native deny after Docker bootstrap',
  },
  {
    arm: 'Bifrost default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'yes',
    note: 'Allow-all VK → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Bifrost best-config',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '9 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'no',
    note: 'Native VK omits memory_ingest — 0 of 5 memory writes',
  },
  {
    arm: 'Executor default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'yes',
    note: 'Code-mode execute → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Executor best-config',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '9 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'no',
    note: 'Native policies.block — 0 of 5 memory writes',
  },
] as const

/** Shown under the scorecard — where peer 0/12 comes from. */
export const multiAttackMemoryWriteBreakout =
  'Memory-write breakout (same 14 suite): ClawQL keeps 5 of 5 memory writes. Bifrost/Executor best-config score 0 of 5 memory writes when ingest is omitted or blocked — that is why they land at 9 of 14 while tying 0 of 12 on attacks.'

export const multiAttackRecallNote =
  'Recall integrity asks whether the agent still answers 15.00. Peers pass that smoke query; unlabeled poison in their vault is a separate column (also contamination). Harder queries where poison ranks first ship with MAI_LIVE=1.'

export const multiAttackPublishGate =
  'Draft until Obot is measured (Docker / Mac mini) and live matrix leaves scaffold (MAI_LIVE=1, including harder recall queries). Headline benign uses the same 14 cases on every arm.'

export const multiAttackBenignSummary =
  'Every arm runs the same 14 benign cases (recall, search/cache/audit, memory writes, skills, same-source reply, internal team/forward, third-party still blocked). Peers that omit or block ingest fail the five memory-write cases and keep the rest — publish X of 14, then the memory-write breakout. Contamination = hostile content surfaced as trusted (same as the governance board).'

export const multiAttackSharedVaultNote =
  'Peers have no built-in vault. Every arm writes the same Obsidian-compatible Memory/ served over MCP (vault-mcp).'
