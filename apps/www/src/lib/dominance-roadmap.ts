/**
 * Category dominance roadmap for clawql.com/benchmarks.
 * Measured peers stay on the pets / Cloudflare boards; this table names who else
 * must clear equal-arm before a category-wide claim.
 */

export type DominanceBoardStatus = 'measured' | 'partial' | 'not_on_board'

export type DominanceCompetitor = {
  id: string
  name: string
  whyItMatters: string
  criteriaToBeat: string
  howToProve: string
  status: DominanceBoardStatus
  /** Short label for the status chip on /benchmarks. */
  statusLabel: string
  /** Pointer into existing ClawQL boards or next harness work. */
  nextStep: string
}

export const dominanceRoadmapHeadline = 'Path to category dominance — equal-arm only.'

export const dominanceRoadmapSummary =
  'Published strengths are why each peer matters. A conclusive claim still requires the minimum set below on a shared fixture — not a collage of vendor blogs. Status reflects what ClawQL has already measured on equal-arm boards.'

export const dominanceMinimumCriteria = [
  'Equal-arm multi-turn workflow (same OpenAPI / pets fixture)',
  'Interleaved runs (n ≥ 10 000 for tails)',
  'Weighted tokens (definitions + discovery + results + 5× model-written)',
  'Real models with rules frozen beforehand',
  'Full process-tree RSS',
  'p99 concurrency under an explicit SLO',
  'Governance surfaces exercised (audit entries + policy-bound writes)',
  'Published harness, fixtures, and raw artifacts',
  'Maintainer invitation for config fixes',
] as const

export const dominanceCompetitors: readonly DominanceCompetitor[] = [
  {
    id: 'bifrost',
    name: 'Bifrost (Maxim)',
    whyItMatters:
      'Equal-arm tokens + governance measured here. Vendor-reported (not our board): Code Mode input-token reduction and ~11 µs overhead @ 5k RPS — verify against Maxim’s published docs before citing outside this page.',
    criteriaToBeat:
      'Multi-turn weighted tokens (incl. model-written), p99 concurrency under SLO, governance depth on the same fixture.',
    howToProve:
      'Interleaved multi-step OpenAPI/pets workflow vs their Code Mode; publish harness + raw results; invite maintainer config fixes.',
    status: 'partial',
    statusLabel: 'Tokens + gov measured',
    nextStep:
      'Tokens on N=12/C=40. Governance v2: defaults tied (Bifrost allow-all 2/5); best-config VK deny invited (expect tie). Category claim → design cells + p99 concurrency.',
  },
  {
    id: 'truefoundry',
    name: 'TrueFoundry',
    whyItMatters:
      'Enterprise governance surfaces (HITL, delegation, RBAC). Latency and RPS/core figures elsewhere are vendor-reported — not measured on ClawQL’s equal-arm board.',
    criteriaToBeat: 'Token savings + concurrency vs their gateway, policy-bound writes, audit completeness.',
    howToProve:
      'Same multi-turn board with their MCP proxy; measure weighted tokens + p99 clients before SLO break; compare approval binding + trail.',
    status: 'not_on_board',
    statusLabel: 'Not on board',
    nextStep:
      'Credentials blocker. Same governance-policy-depth board accepts TRUEFOUNDRY_MCP_URL-style peer once tenant gateway exists.',
  },
  {
    id: 'cloudflare-code-mode',
    name: 'Cloudflare Code Mode',
    whyItMatters: 'Entire ~2.5k-endpoint API in ~1k tokens via code execution.',
    criteriaToBeat: 'Known-ops / filtered path tokens on realistic zone-audit style workflow; real-model turns.',
    howToProve:
      'Replay identical Cloudflare fixture; report weighted tokens + turns; show ClawQL known-ops or program mode still lower.',
    status: 'partial',
    statusLabel: 'Partial (fan-out)',
    nextStep:
      'Fan-out/join claim50v2 + plan.c on the CF board; finish blind dual-model (small arm) under frozen rules.',
  },
  {
    id: 'published-gateway-techniques',
    name: 'Published techniques: tool search · response projection · code mode',
    whyItMatters:
      'Industry write-ups describe tool search, GraphQL-style response projection, and Code Mode as gateway leverage. Named as techniques — not as a head-to-head peer until measured on the shared fixture.',
    criteriaToBeat: 'Result projection + search efficiency on multi-turn; scale-out concurrency.',
    howToProve:
      'Adapt the published techniques to the shared fixture; measure projection savings and session cost vs ClawQL JMESPath + known-ops.',
    status: 'not_on_board',
    statusLabel: 'Not on board',
    nextStep: 'Projection-technique bake-off once pets board can host a Code Mode peer.',
  },
  {
    id: 'agentgateway',
    name: 'agentgateway (Solo.io / LF)',
    whyItMatters: 'MCP + A2A federation; CEL policies; OpenTelemetry; already in prior boards.',
    criteriaToBeat: 'Token efficiency and concurrency on equal-arm board; policy expressiveness.',
    howToProve:
      'Re-run current pets/Cloudflare boards with the latest version; add A2A-style multi-agent turn if relevant.',
    status: 'measured',
    statusLabel: 'Measured',
    nextStep: 'Re-pin latest agentgateway binary on gateway-multi + CF concurrency boards.',
  },
  {
    id: 'contextforge',
    name: 'IBM ContextForge',
    whyItMatters: 'Multi-protocol federation (MCP/A2A/REST/gRPC); 40+ plugins; already measured (higher latency).',
    criteriaToBeat: 'Latency + token overhead vs nested setups; governance plugins.',
    howToProve: 'Direct equal-arm (no nesting); measure gateway-cost p50/p999 and RSS under the same SLO.',
    status: 'partial',
    statusLabel: 'Partial (nested off)',
    nextStep: 'Direct (non-nested) ContextForge arm — prior boards skipped nested MCPJungle adapter by default.',
  },
  {
    id: 'obot',
    name: 'Obot',
    whyItMatters: 'Open-source enterprise registry + per-tool policy; curated catalogs; K8s-native.',
    criteriaToBeat: 'Token surface of curated tools; policy enforcement overhead.',
    howToProve:
      'Measure definitions + discovery tokens with their catalog model; compare audit/policy on the same workflow.',
    status: 'partial',
    statusLabel: 'Tokens + gov measured',
    nextStep:
      'Tokens 3.95× @N=12. Governance v2: defaults tied at 2/5; best-config Obot deny invited (expect 5/5 tie). Design cells next.',
  },
  {
    id: 'executor',
    name: 'Executor (v1/v2)',
    whyItMatters:
      'Closest prior peer; sandbox code execution; per-tool approvals + MCP proxy (Gmail wrappers) — already on published boards.',
    criteriaToBeat: 'Token lead + governance cells: risky-write approval/deny + untrusted-read→hostile follow-up.',
    howToProve: 'Tokens: re-pin latest. Governance: ci-executor-peer.sh → results-cells.json.',
    status: 'measured',
    statusLabel: 'Tokens + cells · resume dominance',
    nextStep:
      'Tokens/latency measured (v2 β.15 → 3.38×). Governance: pause cells tie 5/5; resume_auto_approve ClawQL 5/5 vs Executor 2/5 (model resume accept contaminates). Remeasure on the current Executor beta tip after maintainer review — there is no stable 2.0.0.',
  },
  {
    id: 'celld-durability',
    name: 'celld program journal (ProgramCellDO)',
    whyItMatters:
      'Journaled program resume on celld — public numbers on /benchmarks#durability. Not a durable execution engine.',
    criteriaToBeat:
      'Tiers A/B/D CI-gated; Tier C two-node R2 peer kill + phased board (never repeated a write; in-flight → outcome unknown).',
    howToProve: 'Publish on /benchmarks#durability + docs/benchmarks/durability-proof/. Avoid “exactly once.”',
    status: 'partial',
    statusLabel: 'Lab Yes · fleet Yes (R2)',
    nextStep:
      'Public: /benchmarks#durability (v4 N=1000, 0 correctness, ~17s resume p50). Dual-column ClawQL arms; Pi Durable/Golem pending invite. Not durable execution.',
  },
] as const

export const dominancePriorityOrder = [
  'bifrost',
  'cloudflare-code-mode',
  'celld-durability',
  'truefoundry',
  'published-gateway-techniques',
  'executor',
  'agentgateway',
  'obot',
  'contextforge',
] as const
