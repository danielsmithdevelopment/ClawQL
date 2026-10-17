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
      'Code Mode: 58–92.8% input-token reduction at 96–508 tools; 11 µs overhead @ 5k RPS; virtual-key tool scoping + audit logs.',
    criteriaToBeat:
      'Multi-turn weighted tokens (incl. model-written), p99 concurrency under SLO, governance depth on the same fixture.',
    howToProve:
      'Interleaved multi-step OpenAPI/pets workflow vs their Code Mode; publish harness + raw results; invite maintainer config fixes.',
    status: 'partial',
    statusLabel: 'Tokens measured',
    nextStep:
      'Equal-arm N=12/C=40 board landed (Code Mode 2.25× / classic 3.95× vs ClawQL after compact JSON). Still need p99 concurrency + governance-depth criteria for a category claim.',
  },
  {
    id: 'truefoundry',
    name: 'TrueFoundry',
    whyItMatters:
      'Enterprise governance (HITL approvals, per-user delegation, RBAC); ~3–4 ms latency; 350 RPS/core; strong observability.',
    criteriaToBeat: 'Token savings + concurrency vs their gateway, policy-bound writes, audit completeness.',
    howToProve:
      'Same multi-turn board with their MCP proxy; measure weighted tokens + p99 clients before SLO break; compare approval binding + trail.',
    status: 'not_on_board',
    statusLabel: 'Not on board',
    nextStep: 'Next unmeasured peer after Bifrost/Obot token boards — governance-depth equal-arm.',
  },
  {
    id: 'cloudflare-code-mode',
    name: 'Cloudflare Code Mode',
    whyItMatters: 'Entire ~2.5k-endpoint API in ~1k tokens via code execution.',
    criteriaToBeat:
      'Known-ops / filtered path tokens on realistic zone-audit style workflow; real-model turns.',
    howToProve:
      'Replay identical Cloudflare fixture; report weighted tokens + turns; show ClawQL known-ops or program mode still lower.',
    status: 'partial',
    statusLabel: 'Partial (fan-out)',
    nextStep:
      'Fan-out/join claim50v2 + plan.c on the CF board; finish blind dual-model (small arm) under frozen rules.',
  },
  {
    id: 'uber-mcp-gateway',
    name: 'Uber MCP Gateway',
    whyItMatters:
      'Production scale (800+ servers / 5k tools); tool search + GraphQL-style response projection + Code Mode default.',
    criteriaToBeat: 'Result projection + search efficiency on multi-turn; scale-out concurrency.',
    howToProve:
      'Adapt their published techniques to the shared fixture; measure projection savings and session cost vs ClawQL JMESPath + known-ops.',
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
    statusLabel: 'Tokens measured',
    nextStep:
      'Equal-arm N=12/C=40 via Obot mcp-connect catalog: classic 3.95× vs ClawQL (same fat aggregator path). Still need policy-overhead + governance-depth criteria.',
  },
  {
    id: 'executor',
    name: 'Executor (v1/v2)',
    whyItMatters: 'Closest prior peer; sandbox code execution; already on published boards.',
    criteriaToBeat: 'Confirm leads hold after their updates; multi-turn + concurrency.',
    howToProve: 'Re-run full board with latest versions; include real-model validation under pre-committed rules.',
    status: 'measured',
    statusLabel: 'Measured',
    nextStep:
      'Keep version-scoped claims; v2 β multiturn 29 927 (3.38× vs ClawQL) + HTTP chaos 29/30 remasured 2026-10-17. Re-run when Executor ships tooling changes.',
  },
] as const

export const dominancePriorityOrder = [
  'bifrost',
  'cloudflare-code-mode',
  'truefoundry',
  'uber-mcp-gateway',
  'executor',
  'agentgateway',
  'obot',
  'contextforge',
] as const
