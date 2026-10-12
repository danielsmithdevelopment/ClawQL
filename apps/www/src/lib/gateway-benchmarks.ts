/**
 * Equal-arm multi-gateway benchmark board for clawql.com/benchmarks.
 * Source: docs/benchmarks/gateway-multi-comparison (10k × 12-turn multiturn + path matrix).
 * Host-bound — re-run on a dedicated bench host before tightening external claims.
 */

/** Set to an R2 (or CDN) HTTPS URL when the ~84s walkthrough is ready to embed. */
export const BENCHMARK_VIDEO_SRC: string | null = null

export const BENCHMARK_VIDEO_META = {
  durationSeconds: 84,
  approxSizeMb: 11,
  placeholderLabel: 'Walkthrough video',
  placeholderHint: '≈84 seconds · ~11 MB — will stream from object storage when published',
} as const

export const gatewayBenchmarkHeadline = 'Most efficient governed MCP gateway — measured, not marketed.'

export const gatewayBenchmarkSummary =
  'Equal-arm board: same 40-tool fat catalog, same task success, 10 000 × 12-turn flows. ClawQL is the only measured arm that cuts tokens versus a fair direct-HTTP baseline — via gateway result projection. Aggregators match the baseline; Executor pays a pretty-print tax (v1) or still trails after compact envelopes (v2 beta).'

export const gatewayBenchmarkClaim =
  'Fewest I/O tokens among measured MCP aggregators and live Executor, with equal task success.'

export type GatewayCompetitorColumn = 'ClawQL' | 'Executor' | 'MCPJungle' | 'agentgateway'

export const gatewayCompetitorColumns: GatewayCompetitorColumn[] = [
  'ClawQL',
  'Executor',
  'MCPJungle',
  'agentgateway',
]

export type GatewayFeatureRow = {
  feature: string
  values: Record<GatewayCompetitorColumn, string | boolean>
  footnote?: string
}

/** Competitive landscape — hot-path capability + platform surface (honest empties). */
export const gatewayFeatureRows: GatewayFeatureRow[] = [
  {
    feature: 'Auth / capability gate on the hot path',
    values: { ClawQL: true, Executor: false, MCPJungle: 'Optional', agentgateway: 'Optional' },
  },
  {
    feature: 'Operation risk / policy',
    values: { ClawQL: true, Executor: false, MCPJungle: false, agentgateway: false },
    footnote: 'Bench runs ALLOW_NO_ENFORCEMENT; the gate is still present.',
  },
  {
    feature: 'Ephemeral audit ring',
    values: { ClawQL: true, Executor: false, MCPJungle: false, agentgateway: false },
  },
  {
    feature: 'Output redaction hooks',
    values: { ClawQL: true, Executor: false, MCPJungle: false, agentgateway: false },
    footnote: 'Available in ClawQL; unused on the pets fixture.',
  },
  {
    feature: 'Result projection (where / fields)',
    values: {
      ClawQL: 'Gateway-enforced',
      Executor: 'Pass-through',
      MCPJungle: false,
      agentgateway: false,
    },
    footnote: 'Primary token win on this board — ClawQL shrinks fat results at the gateway.',
  },
  {
    feature: 'Multi-tool catalog discovery',
    values: {
      ClawQL: 'Server-side search',
      Executor: 'Code / N/A',
      MCPJungle: 'Full tools/list',
      agentgateway: 'Full tools/list',
    },
  },
  {
    feature: 'Upstream HTTP to equal mock',
    values: { ClawQL: true, Executor: 'Sandbox (upstream=0)', MCPJungle: true, agentgateway: true },
  },
  {
    feature: 'Persistent agent memory (vault)',
    values: { ClawQL: true, Executor: false, MCPJungle: false, agentgateway: false },
  },
  {
    feature: 'Semantic enterprise search',
    values: { ClawQL: 'Onyx', Executor: false, MCPJungle: false, agentgateway: false },
  },
  {
    feature: 'WORM / Merkle audit trail',
    values: { ClawQL: true, Executor: 'Basic log', MCPJungle: false, agentgateway: false },
  },
  {
    feature: 'Unlimited executions (no meter)',
    values: { ClawQL: true, Executor: 'Capped + overage', MCPJungle: 'Self-host', agentgateway: 'Self-host' },
  },
  {
    feature: '12-turn I/O tokens vs fair baseline',
    values: {
      ClawQL: '−14 463 (−41%)',
      Executor: '+18 666 (v1) / −5 075 (v2 β)',
      MCPJungle: '+320',
      agentgateway: 'Match',
    },
    footnote: 'combined @12 = definitions + Σ discovery + Σ results. Baseline defs pinned to agentgateway tools/list.',
  },
]

export type TokenScorecardRow = {
  arm: string
  highlight?: boolean
  definitions: string
  discovery: string
  results: string
  combined: string
  vsDirect: string
  flowP50: string
  flowP999: string
  rssMed: string
  taskSuccess: string
  note?: string
}

/** 10 000 × 12-turn multiturn board (classic Layer1-once + Σ Layer2). */
export const tokenScorecardRows: TokenScorecardRow[] = [
  {
    arm: 'Direct HTTP',
    definitions: '5 520',
    discovery: '0',
    results: '29 482',
    combined: '35 002',
    vsDirect: 'baseline',
    flowP50: '2.2',
    flowP999: '9.4',
    rssMed: '—',
    taskSuccess: 'PASS',
    note: 'No gateway process. Defs = agentgateway serialization of the same 40 ops.',
  },
  {
    arm: 'ClawQL (Node)',
    highlight: true,
    definitions: '297',
    discovery: '11 568',
    results: '8 674',
    combined: '20 539',
    vsDirect: '−14 463',
    flowP50: '18.2',
    flowP999: '56.8',
    rssMed: '678',
    taskSuccess: 'PASS',
  },
  {
    arm: 'ClawQL (Bun)',
    highlight: true,
    definitions: '297',
    discovery: '11 568',
    results: '8 674',
    combined: '20 539',
    vsDirect: '−14 463',
    flowP50: '15.0',
    flowP999: '35.0',
    rssMed: '337',
    taskSuccess: 'PASS',
    note: 'Same tokens as Node; ~50% lower multiturn RSS on this host.',
  },
  {
    arm: 'Executor 1.6.10',
    definitions: '90',
    discovery: '0',
    results: '53 578',
    combined: '53 668',
    vsDirect: '+18 666',
    flowP50: '64.4',
    flowP999: '106.6',
    rssMed: '213',
    taskSuccess: 'PASS',
    note: 'Defs save 5 430; pretty-print results add 24 096. Discovery=0 favors Executor vs ClawQL’s charged search.',
  },
  {
    arm: 'Executor 2.0.0-β.15',
    definitions: '181',
    discovery: '0',
    results: '29 746',
    combined: '29 927',
    vsDirect: '−5 075',
    flowP50: '74.0',
    flowP999: '126.0',
    rssMed: '968',
    taskSuccess: 'PASS',
    note: 'HTTP /mcp compact envelope — no indent tax. Still +9 388 vs ClawQL; RSS ready/med/max 604/968/1305 MB.',
  },
  {
    arm: 'MCPJungle',
    definitions: '5 840',
    discovery: '0',
    results: '29 482',
    combined: '35 322',
    vsDirect: '+320',
    flowP50: '15.4',
    flowP999: '135.0',
    rssMed: '153',
    taskSuccess: 'PASS',
  },
  {
    arm: 'agentgateway',
    definitions: '5 520',
    discovery: '0',
    results: '29 482',
    combined: '35 002',
    vsDirect: 'match',
    flowP50: '13.6',
    flowP999: '330.9',
    rssMed: '214',
    taskSuccess: 'PASS',
  },
]

export type LatencyScorecardRow = {
  arm: string
  highlight?: boolean
  e2e: string
  gatewayCost: string
  rssMed: string
  listTok: string
  invokedSchema: string
  resultTok: string
}

/** Interleaved n=10 000 single-call board (composition slim). */
export const latencyScorecardRows: LatencyScorecardRow[] = [
  {
    arm: 'ClawQL',
    highlight: true,
    e2e: '1.02 / 1.95 / 3.82 / 7.41',
    gatewayCost: '0.70 / 3.48 / 6.87',
    rssMed: '427',
    listTok: '1 189',
    invokedSchema: '178',
    resultTok: '59',
  },
  {
    arm: 'Executor',
    e2e: '2.36 / 5.12 / 6.61 / 11.49',
    gatewayCost: '2.36 / 6.61 / 11.49',
    rssMed: '210',
    listTok: '2 243',
    invokedSchema: '90',
    resultTok: '59',
  },
  {
    arm: 'MCPJungle',
    e2e: '1.34 / 2.72 / 4.36 / 6.86',
    gatewayCost: '1.02 / 3.99 / 6.52',
    rssMed: '152',
    listTok: '46',
    invokedSchema: '46',
    resultTok: '28',
  },
  {
    arm: 'agentgateway',
    e2e: '1.17 / 2.38 / 4.21 / 7.29',
    gatewayCost: '0.84 / 3.81 / 6.87',
    rssMed: '215',
    listTok: '37',
    invokedSchema: '37',
    resultTok: '28',
  },
]

export const gatewayBenchmarkHonesty = [
  {
    title: 'What we claim',
    body: 'Fewest tokens among measured MCP aggregators and live Executor with equal task success. Lowest governed gateway cost on the n=10 000 interleaved board. Latency competitive with the fastest aggregators (best p50; MCPJungle best p999).',
  },
  {
    title: 'What we do not claim',
    body: 'Scale-out concurrency wins (need same-topology 1× and 4-replica boards for every arm). Memory wins — ClawQL is the heaviest serious arm on RSS. Category-wide supremacy until Bifrost / mcp-gateway compact shortlist arms are on the board.',
  },
  {
    title: 'Executor framing',
    body: 'Discovery is harness-authored execute (0 discovery tokens) on both Executor versions — that favors Executor versus ClawQL’s charged 11 568 search tokens. v1 net loss is pretty-print; v2 compact wins tokens but still trails ClawQL by ~9.4k @12 and costs more RSS/latency on this path.',
  },
  {
    title: 'Next ClawQL lever',
    body: 'Discovery is 56% of ClawQL’s combined @12. Leaner search hits (~300 tok/turn) or skip-search when the agent already knows the operationId would cut ~8k more — without touching projection.',
  },
] as const

export const gatewayBenchmarkLinks = [
  {
    label: 'Full multi-gateway board',
    href: '/benchmarks/gateway-multi-comparison/',
    detail: 'Interactive scorecard, path matrix, Bun rationale, vs direct',
  },
  {
    label: 'Executor latency board',
    href: '/benchmarks/executor-comparison/',
    detail: 'Earlier side-by-side latency artifacts',
  },
  {
    label: 'Method + artifacts (docs)',
    href: 'https://docs.clawql.com/benchmarks/gateway-multi-comparison',
    detail: 'Equal-arm contract, regenerate commands, claim bounds',
  },
  {
    label: 'Context-compression essay',
    href: 'https://pragmaticvectors.com/posts/both-sides-of-context-compression',
    detail: 'Why Layer 2 projection compounds the same way on both sides',
  },
] as const

export const gatewayBenchmarkMeta = {
  measuredLabel: 'Measured Oct 2026 · host-bound',
  multiturnLabel: '10 000 flows × 12 turns · 40-tool fat catalog',
  latencyLabel: 'n=10 000 interleaved · composition slim',
  artifactMultiturn: 'gateway-multi-multiturn-10k.json',
  artifactExecutorV2: 'gateway-multi-multiturn-executor-v2-10k.json',
  artifactLatency: 'gateway-multi-cmp-10k.json',
} as const
