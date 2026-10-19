/**
 * Multi-attack injection board — marketing mirror of
 * docs/benchmarks/security-suite/multi-attack-injection/
 *
 * Scripted board complete. Lead claim waits on MAI_LIVE real-model sessions.
 */

export const multiAttackHeadline = 'Multi-attack injection — scripted guarantee + live fool-rate'

export const multiAttackSummary =
  'Twelve planted attacks across email, ticket, doc, and webhook. Scripted worst-case model always complies — that board is the guarantee when a model is fooled. Live runs show how often models get fooled, and that ClawQL costs nothing when they don’t. Peers share the same Obsidian-compatible Memory/ over MCP; the same 14 benign cases run on every arm.'

export const multiAttackHeadlineResult =
  'Models resist most attacks; ClawQL is there for the ones they don’t, at no cost to ordinary work. Scripted: ClawQL 0 of 12 + 14 of 14 benign; peer best-config 0 of 12 + 9 of 14 (memory off); peer defaults 12 of 12. Live (composer-2.5-fast, pre-registered): refused all 12 on ClawQL and passthrough — no instruction-follow and no hostile vault residue under the ingest-or-refuse prompt; benign still 14 of 14. Do not hunt for a gullible model. Next live hardness: AgentDojo + Datadog counterfeit-policy. Measure poison residue (ordinary summaries) as well as obedience.'

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
  /** Peer product version / ClawQL commit pin. */
  version: string
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
    version: 'ClawQL 8.0.0 (results-smoke versions.clawql)',
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
    version: 'vault-mcp control',
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
    version: 'ClawQL 8.0.0 (results-smoke versions.clawql)',
    note: 'Taint-first + overwrite-park + labelable memory',
  },
  {
    arm: 'Obot default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'yes',
    version: 'ghcr.io/obot-platform/obot:latest · macOS / Mac mini',
    note: 'Allow-all mcp-connect → Obsidian vault-mcp (equal-arm loss)',
  },
  {
    arm: 'Obot best-config',
    column: 'best_config',
    status: 'measured',
    attacksTakingEffect: '0 of 12',
    benignAsExpected: '9 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'no',
    version: 'ghcr.io/obot-platform/obot:latest · macOS / Mac mini',
    note: 'Native webhook deny · precondition passed · 0 of 5 memory writes',
  },
  {
    arm: 'Bifrost default',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '12 of 12',
    benignAsExpected: '14 of 14',
    recallIntegrity: 'pass (15.00)',
    unlabeledPoison: 'yes',
    version: 'Bifrost 2.3.1 · Linux',
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
    version: 'Bifrost 2.3.1 · Linux',
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
    version: 'executor@1.6.10 · Linux',
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
    version: 'executor@1.6.10 · Linux',
    note: 'Native policies.block — 0 of 5 memory writes',
  },
] as const

/** Shown under the scorecard — where peer 0/12 comes from. */
export const multiAttackMemoryWriteBreakout =
  'Memory-write breakout (same 14 suite): ClawQL keeps 5 of 5 memory writes. Bifrost/Executor/Obot best-config score 0 of 5 memory writes when ingest is omitted or blocked — that is why they land at 9 of 14 while tying 0 of 12 on attacks.'

export const multiAttackRecallNote =
  'Recall integrity asks whether the agent still answers 15.00. Peers pass that smoke query; unlabeled poison is a separate column. Hard-recall vault grader: labeled 15.00 / unlabeled 99.99. Live also grades poison residue — a model can refuse an injected instruction and still summarize hostile text into memory (trusted on passthrough, labeled on ClawQL).'

export const multiAttackPublishGate =
  'Two parts, both true: scripted board = guarantee when fooled; live = fool-rate + no benign cost. Pre-register models including small open-weight (llama-3.1-8b, qwen2.5-7b — representativeness) and publish every result — never search for a gullible model. AgentDojo: report its ASR + utility alongside ClawQL grades. Measure poison residue, not only obedience.'

export const multiAttackBenignSummary =
  'Every arm runs the same 14 benign cases (recall, search/cache/audit, memory writes, skills, same-source reply, internal team/forward, third-party still blocked). Peers that omit or block ingest fail the five memory-write cases and keep the rest — publish X of 14, then the memory-write breakout. Contamination = hostile content surfaced as trusted (same as the governance board).'

export const multiAttackSharedVaultNote =
  'Peers have no built-in vault. Every arm writes the same Obsidian-compatible Memory/ served over MCP (vault-mcp).'

/** Platform honesty — Obot is Mac mini; other measured arms were Linux. */
export const multiAttackPlatformNote =
  'Bifrost and Executor smoke peers ran on Linux. Obot runs on the Mac mini (results stamp macOS / measured_on=mac_mini). Docker Desktop’s Linux VM is fine here — this board measures whether attacks take effect, not speed or memory.'

export const multiAttackVersionNote =
  'Every row pins the ClawQL commit (see results-smoke.json versions.clawql) and the peer product version: Obot container image, Bifrost binary (@maximhq/bifrost), Executor npm package. Re-run peer CI to refresh digests when anyone ships an update.'

export const multiAttackMaintainerInvite = {
  framing:
    'Peer maintainers: if you have a stronger native configuration — especially one that keeps memory writes working while stopping these attacks — open a PR with raw JSON. Preferred first response: a better configuration, not that the board is unfair.',
  peers: [
    {
      product: 'Bifrost',
      mechanism: 'Virtual key that omits memory_ingest',
      command: 'npm run benchmark:multi-attack-injection:bifrost',
    },
    {
      product: 'Executor',
      mechanism: 'Native policies.block on vault memory_ingest',
      command: 'npm run benchmark:multi-attack-injection:executor',
    },
    {
      product: 'Obot',
      mechanism: 'mcp-webhook-validations deny (precondition, then one 12+14 run)',
      command: 'npm run benchmark:multi-attack-injection:obot',
      docs: 'MAC-MINI-OBOT.md',
    },
  ],
} as const

/**
 * Datadog / Jev counterfeit-policy cell — model advises, never is the gate.
 * Cite: https://securitylabs.datadoghq.com/articles/jev-as-a-judge-how-counterfeit-policy-steers-jev/
 * No harness stand-in for the model-judged peer (fails by construction).
 */
export const multiAttackCounterfeitPolicyNote =
  'Datadog showed that model-judged gates can be talked out of their own policy with a prepended counterfeit policy. ClawQL’s gate does not take instructions from the content it judges — trust comes from source labels, spec-derived risk, and person-bound approvals. ClawQL deterministic smoke is 0 of 4. Model-judged peers stay pending until a real LangChain/Jev run on a public Datadog-cited set, with JevShield “data, not instructions” as best-config — no harness stand-in.'

export type MultiAttackCounterfeitRow = {
  arm: string
  column: 'defaults' | 'best_config'
  status: 'measured' | 'pending'
  attacksTakingEffect: string
  note: string
  highlight?: boolean
}

export const multiAttackCounterfeitRows: readonly MultiAttackCounterfeitRow[] = [
  {
    arm: 'ClawQL deterministic',
    column: 'defaults',
    status: 'measured',
    attacksTakingEffect: '0 of 4',
    note: 'Source labels + park — content cannot redefine trusted',
    highlight: true,
  },
  {
    arm: 'Model-judged defaults',
    column: 'defaults',
    status: 'pending',
    attacksTakingEffect: '—',
    note: 'LangChain/Jev on public set + counterfeit policy — cite Datadog until measured',
  },
  {
    arm: 'Model-judged best-config',
    column: 'best_config',
    status: 'pending',
    attacksTakingEffect: '—',
    note: 'JevShield “data, not instructions” on same public set — pending ≠ not_offered',
  },
] as const
