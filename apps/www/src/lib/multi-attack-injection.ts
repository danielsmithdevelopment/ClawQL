/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * Not a live category claim yet (publish gate — Obot still pending Docker).
 */

export const multiAttackHeadline = 'Multi-attack injection — smoke (draft)'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — this measures whether the gateway stops the resulting action, not whether a real model would fall for it. Sample size: smoke until the suite grows to dozens. Peers have no built-in vault, so every arm writes the same Obsidian-compatible Memory/ served over MCP. Benign workflows are scored beside attacks so a tool omit that ties 0/12 also shows the cost to legitimate memory writes.'

export const multiAttackHeadlineResult =
  'Smoke v4d: ClawQL default 0 of 12 attacks and 14 of 14 benign (label + park). Bifrost/Executor defaults 12 of 12 on the shared Obsidian vault; best-config 0 of 12 via native VK omit / policies.block — with 0 of 3 memory writes. Recall integrity fails on peer defaults (unlabeled poison). Obot pending (Docker / Mac mini).'

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
  /** Benign cases that behaved as expected (capability kept). */
  benignAsExpected: string
  /** After defaults attacks: does recall still answer trusted 15.00? */
  recallIntegrity: string
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
    note: 'Direct Obsidian Memory/ vault-mcp (no gateway)',
  },
  {
    arm: 'ClawQL configured',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    note: 'Taint-first + overwrite-park + labelable memory',
  },
  {
    arm: 'Obot default',
    column: 'defaults',
    status: 'pending',
    attacksTakingEffect: '—',
    benignAsExpected: '—',
    recallIntegrity: '—',
    note: 'Docker required for ci-obot-peer.sh (Mac mini) — pending ≠ not_offered',
  },
  {
    arm: 'Obot best-config',
    column: 'best_config',
    status: 'pending',
    attacksTakingEffect: '—',
    benignAsExpected: '—',
    recallIntegrity: '—',
    note: 'Wire Obot native deny after Docker bootstrap',
  },
  {
    arm: 'Bifrost default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '3 of 3 memory writes',
    recallIntegrity: 'fail (unlabeled poison)',
    note: 'Allow-all VK → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Bifrost best-config',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '0 of 3 memory writes',
    recallIntegrity: '—',
    note: 'Native VK omits memory_ingest (capability off)',
  },
  {
    arm: 'Executor default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '3 of 3 memory writes',
    recallIntegrity: 'fail (unlabeled poison)',
    note: 'Code-mode execute → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Executor best-config',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '0 of 3 memory writes',
    recallIntegrity: '—',
    note: 'Native coreTools.policies.block on mai-vault.org.default.memory_ingest',
  },
] as const

export const multiAttackPublishGate =
  'Draft until Obot is measured (Docker / Mac mini) and live matrix leaves scaffold (MAI_LIVE=1). Best-config peers may tie 0/12 only by turning off ingest — the benign column makes that cost visible.'

export const multiAttackBenignSummary =
  'Benign suite includes the outbound boundary on ClawQL: reply-to-sender and internal team/reviewer destinations complete; third-party notify stays blocked. Peer arms score vault memory writes only. Contamination = hostile content surfaced as trusted (same as the governance board). Recall integrity after default attacks: unlabeled peer poison fails; ClawQL labeled poison still answers 15.00.'

export const multiAttackSharedVaultNote =
  'Peers have no built-in vault. Every arm writes the same Obsidian-compatible Memory/ served over MCP (vault-mcp).'
