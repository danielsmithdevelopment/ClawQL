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
  'Equal-arm board: same multiturn harness, same 40-tool fat catalog, same task success, 10 000 × 12-turn flows. ClawQL is the only measured arm that cuts tokens versus a fair direct-HTTP baseline — via gateway result projection. Executor is version-scoped on that same harness: v1.6.10 pretty-prints (+18 666); v2 β compact envelopes (−5 075). ClawQL still leads v2 by 9 388. ClawQL transport matrix (Node/Bun × stdio/HTTP + gRPC) uses the same recipe — compare Executor v2 latency to ClawQL HTTP, not Bun stdio. Peers have no gRPC MCP on this board.'

export const gatewayBenchmarkClaim =
  'Fewest I/O tokens among measured MCP aggregators and live Executor (v1 and v2 β), same harness, equal task success.'

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
    arm: 'ClawQL Node stdio',
    highlight: true,
    definitions: '297',
    discovery: '11 568',
    results: '8 674',
    combined: '20 539',
    vsDirect: '−14 463',
    flowP50: '18.7',
    flowP999: '49.5',
    rssMed: '665',
    taskSuccess: 'PASS',
    note: 'stdio · transport matrix artifact',
  },
  {
    arm: 'ClawQL Bun stdio',
    highlight: true,
    definitions: '297',
    discovery: '11 568',
    results: '8 674',
    combined: '20 539',
    vsDirect: '−14 463',
    flowP50: '16.0',
    flowP999: '39.5',
    rssMed: '344',
    taskSuccess: 'PASS',
    note: 'stdio · same tokens; lowest ClawQL flow p50 on this host',
  },
  {
    arm: 'ClawQL Node HTTP',
    highlight: true,
    definitions: '297',
    discovery: '11 568',
    results: '8 674',
    combined: '20 539',
    vsDirect: '−14 463',
    flowP50: '45.9',
    flowP999: '391.1',
    rssMed: '740',
    taskSuccess: 'PASS',
    note: 'Streamable HTTP · fair latency peer for Executor v2',
  },
  {
    arm: 'ClawQL Bun HTTP',
    highlight: true,
    definitions: '297',
    discovery: '11 568',
    results: '8 674',
    combined: '20 539',
    vsDirect: '−14 463',
    flowP50: '38.9',
    flowP999: '364.5',
    rssMed: '340',
    taskSuccess: 'PASS',
    note: 'Streamable HTTP · Bun RSS ≈ Bun stdio',
  },
  {
    arm: 'ClawQL Node gRPC',
    definitions: '281',
    discovery: '11 568',
    results: '8 674',
    combined: '20 523',
    vsDirect: '−14 479',
    flowP50: '138.7',
    flowP999: '292.2',
    rssMed: '700',
    taskSuccess: 'PASS',
    note: 'gRPC MCP · ClawQL-only on this board (peers have no gRPC MCP). Slower than HTTP for small tool calls.',
  },
  {
    arm: 'ClawQL Bun gRPC',
    definitions: '281',
    discovery: '11 568',
    results: '8 674',
    combined: '20 523',
    vsDirect: '−14 479',
    flowP50: '137.3',
    flowP999: '254.7',
    rssMed: '335',
    taskSuccess: 'PASS',
    note: 'gRPC MCP · Bun keeps RSS low; latency still ~7× stdio on this payload size',
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
    note: 'stdio (`executor mcp`) · pretty-print tax. Discovery=0. Same runExecutorArm loop as v2.',
  },
  {
    arm: 'Executor 2.0.0-β.15',
    definitions: '181',
    discovery: '0',
    results: '29 746',
    combined: '29 927',
    vsDirect: '−5 075',
    flowP50: '73.5',
    flowP999: '143.2',
    rssMed: '927',
    taskSuccess: 'PASS',
    note: 'HTTP /mcp · compare latency to ClawQL Node/Bun HTTP (not Bun stdio). Compact fix credited; ClawQL still −9 388 tokens.',
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
    body: 'Fewest tokens among measured MCP aggregators and live Executor (v1 and v2 β) with equal task success on the same multiturn harness. Lowest governed gateway cost on the n=10 000 interleaved board.',
  },
  {
    title: 'What we do not claim',
    body: 'Scale-out concurrency wins. Memory wins. Mixing Executor v2 latency with ClawQL Bun stdio. gRPC wins vs peers that lack gRPC MCP. Category-wide supremacy until Bifrost / mcp-gateway are on the board.',
  },
  {
    title: 'Executor version scope',
    body: 'v1.6.10: pretty-printed, +18 666 vs baseline. v2 β.15: compact, −5 075 — credit the fix. ClawQL still leads v2 by 9 388. Video scenes that cite the pretty-print tax must label v1.6.10 on-screen, not only in a footer.',
  },
  {
    title: 'ClawQL transport matrix',
    body: 'Node/Bun × stdio/HTTP/gRPC on the same search→execute recipe (10 000 × 12). Tokens match across transports (~20.5k). Fastest: Bun stdio (16.0 ms p50). HTTP is the fair peer for Executor v2 (ClawQL Node HTTP 45.9 vs Executor v2 73.5). gRPC is ClawQL-only here and slower on this small-payload board (~138 ms) — prefer it for large CallTool bodies.',
  },
  {
    title: 'Next ClawQL lever',
    body: 'Discovery is 56% of ClawQL’s combined @12. Leaner search hits (~300 tok/turn) or skip-search when the agent already knows the operationId would cut ~8k more — without touching projection.',
  },
] as const

export const gatewayBenchmarkLinks = [
  {
    label: 'Cloudflare multiturn artifacts',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/docs/benchmarks/cloudflare-multiturn',
    detail: 'Zone-audit board summary, HTTP + stdio concurrency JSON',
  },
  {
    label: 'Fan-out / join board (docs)',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/cursor/cf-mt-fanout-join-board-a621/docs/benchmarks/cloudflare-multiturn/fanout-join',
    detail: 'Program promotion board · scripted claim + real-model gate artifacts',
  },
  {
    label: 'Executor latency board',
    href: '/benchmarks/executor-comparison/',
    detail: 'Earlier side-by-side latency artifacts',
  },
  {
    label: 'Multi-gateway method (docs)',
    href: 'https://docs.clawql.com/benchmarks/gateway-multi-comparison',
    detail: 'Equal-arm pets catalog contract, regenerate commands',
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
  artifactTransportMatrix: 'gateway-multi-multiturn-clawql-transport-10k.json',
  artifactExecutorV2: 'gateway-multi-multiturn-executor-v2-equal-10k.json',
  artifactLatency: 'gateway-multi-cmp-10k.json',
} as const
