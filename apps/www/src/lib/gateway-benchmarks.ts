/**
 * Equal-arm multi-gateway benchmark board for clawql.com/benchmarks.
 * Source: docs/benchmarks/gateway-multi-comparison (N=12/24 multiturn + path matrix).
 * Host-bound — re-run on a dedicated bench host before tightening external claims.
 *
 * Token columns (definitions / discovery / results / combined) are from the compact
 * search+execute remeasure (PR #1330). Latency/RSS on transport rows still cite the
 * transport-matrix host run until that artifact is remeasured.
 */

/** Set to an R2 (or CDN) HTTPS URL when the ~84s walkthrough is ready to embed. */
export const BENCHMARK_VIDEO_SRC: string | null = null

export const BENCHMARK_VIDEO_META = {
  durationSeconds: 84,
  approxSizeMb: 11,
  placeholderLabel: 'Walkthrough video',
  placeholderHint: '≈84 seconds · ~11 MB — will stream from object storage when published',
} as const

/**
 * Provenance for publish cells — flip Cloudflare / Executor-v2 / transport-latency
 * when those boards remeasure under the same compact agent-facing JSON path.
 */
export const gatewayTokenBoardProvenance = {
  compactSearchExecute: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-multiturn.json',
    note: 'Full remasure: clawql+executor+mcpjungle+agentgateway+bifrost+bifrost_codemode+obot @N=12/24',
  },
  bifrostEqualArm: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-multiturn-bifrost.json',
    note: 'Code Mode 2.25× / classic 3.95× vs ClawQL combined @12 (same-run remasure)',
  },
  obotEqualArm: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-multiturn-obot.json',
    note: 'Obot mcp-connect remote catalog — classic 3.95× (same fat aggregator path)',
  },
  interleaved10k: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-cmp-10k.json',
    note: 'ClawQL best p50 e2e/cost; p99/p999 host-bound — no tail-latency win claim',
  },
  chaosTopologyA: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-cmp-chaos-slim.json',
    note: 'ClawQL 79/80 · MCPJungle 151/152 · agentgateway 63/64 · Executor HTTP /mcp 29/30 (stdio still blocked)',
  },
  chaosTopologyB: {
    status: 'current' as const,
    measuredAt: '2026-10-18',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-cmp-chaos-topology-b.json',
    note: '4× HTTP behind sticky LB: ClawQL 121/122 ≈ MCPJungle 125/126 ≫ agentgateway 47/48 — near-tie, no scale-out win',
  },
  transportMatrixLatencyRss: {
    status: 'stale_host_run' as const,
    note: 'Token-scorecard flow p50/p999 + RSS still from transport-matrix host artifact (not the 10k single-call board)',
  },
  executorV2EqualArm: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/gateway-multi-comparison/gateway-multi-multiturn-executor-v2.json',
    note: 'HTTP /mcp remasure: combined 29 927 confirmed — 3.38× vs publish ClawQL 8 866',
  },
  cloudflareMultiturn: {
    status: 'current' as const,
    measuredAt: '2026-10-17',
    artifact: 'docs/benchmarks/cloudflare-multiturn/board-summary-n10000-r3.json',
    note: 'Post–compact-execute 3×10k: known_op 1710 (−123); see /benchmarks#cf',
  },
} as const

export const gatewayBenchmarkHeadline = 'Most efficient governed MCP gateway — measured, not marketed.'

export const gatewayBenchmarkSummary =
  'Equal-arm board: same multiturn harness, same 40-tool fat catalog, same task success. Full remasure 2026-10-17: ClawQL 8 866 combined @12 — ~4× leaner than aggregators / Obot / Bifrost classic, 2.25× leaner than Bifrost Code Mode, 3.38× leaner than Executor v2 β, 6× leaner than Executor v1.6.10, equal task success. vs fair direct-HTTP baseline: −26 136 (−75%). Interleaved n=10k: ClawQL best p50 e2e (1.02 ms) and gateway cost (0.70 ms). Topology-A chaos: ClawQL 79 · Executor HTTP 29 · MCPJungle still leads (151). Topology B (4× sticky LB): ClawQL 121 ≈ MCPJungle 125 — near-tie, no scale-out win.'

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
      ClawQL: '−26 136 (−75%)',
      Executor: '+18 704 (v1) / −5 075 (v2 β†)',
      MCPJungle: '+320',
      agentgateway: 'Match',
    },
    footnote:
      'combined @12 = definitions + Σ discovery + Σ results. Baseline defs pinned to agentgateway tools/list. †Executor v2 β figure pending remeasure under the same compact path.',
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

/**
 * N=12 multiturn board (classic Layer1-once + Σ Layer2).
 * Token columns: compact search+execute remeasure 2026-10-17.
 * Flow/RSS: prior transport-matrix host run (latency unchanged by JSON format).
 */
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
    definitions: '348',
    discovery: '3 732',
    results: '4 786',
    combined: '8 866',
    vsDirect: '−26 136',
    flowP50: '18.7',
    flowP999: '49.5',
    rssMed: '665',
    taskSuccess: 'PASS',
    note: 'stdio · compact search+execute · transport latency/RSS from matrix artifact',
  },
  {
    arm: 'ClawQL Bun stdio',
    highlight: true,
    definitions: '348',
    discovery: '3 732',
    results: '4 786',
    combined: '8 866',
    vsDirect: '−26 136',
    flowP50: '16.0',
    flowP999: '39.5',
    rssMed: '344',
    taskSuccess: 'PASS',
    note: 'stdio · same tokens; lowest ClawQL flow p50 on this host',
  },
  {
    arm: 'ClawQL Node HTTP',
    highlight: true,
    definitions: '348',
    discovery: '3 732',
    results: '4 786',
    combined: '8 866',
    vsDirect: '−26 136',
    flowP50: '45.9',
    flowP999: '391.1',
    rssMed: '740',
    taskSuccess: 'PASS',
    note: 'Streamable HTTP · fair latency peer for Executor v2',
  },
  {
    arm: 'ClawQL Bun HTTP',
    highlight: true,
    definitions: '348',
    discovery: '3 732',
    results: '4 786',
    combined: '8 866',
    vsDirect: '−26 136',
    flowP50: '38.9',
    flowP999: '364.5',
    rssMed: '340',
    taskSuccess: 'PASS',
    note: 'Streamable HTTP · Bun RSS ≈ Bun stdio',
  },
  {
    arm: 'ClawQL Node gRPC',
    definitions: '348',
    discovery: '3 732',
    results: '4 786',
    combined: '8 866',
    vsDirect: '−26 136',
    flowP50: '138.7',
    flowP999: '292.2',
    rssMed: '700',
    taskSuccess: 'PASS',
    note: 'gRPC MCP · ClawQL-only on this board (peers have no gRPC MCP). Same compact token recipe; slower than HTTP for small tool calls.',
  },
  {
    arm: 'ClawQL Bun gRPC',
    definitions: '348',
    discovery: '3 732',
    results: '4 786',
    combined: '8 866',
    vsDirect: '−26 136',
    flowP50: '137.3',
    flowP999: '254.7',
    rssMed: '335',
    taskSuccess: 'PASS',
    note: 'gRPC MCP · Bun keeps RSS low; latency still ~7× stdio on this payload size',
  },
  {
    arm: 'Executor 1.6.10',
    definitions: '128',
    discovery: '0',
    results: '53 578',
    combined: '53 706',
    vsDirect: '+18 704',
    flowP50: '64.4',
    flowP999: '106.6',
    rssMed: '213',
    taskSuccess: 'PASS',
    note: 'stdio (`executor mcp`) · fat return / pretty-print tax. Discovery=0. Same runExecutorArm loop as v2.',
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
    note: 'HTTP /mcp remasured 2026-10-17 · 3.38× vs ClawQL 8 866 (−21 061 tokens) · vsDirect −5 075 · compare latency to ClawQL Node/Bun HTTP',
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
    note: '3.98× vs ClawQL combined @12',
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
    note: '3.95× vs ClawQL combined @12 · same fat path as Bifrost classic / Obot',
  },
  {
    arm: 'Bifrost classic',
    definitions: '5 520',
    discovery: '0',
    results: '29 482',
    combined: '35 002',
    vsDirect: 'match',
    flowP50: '3.0',
    flowP999: '—',
    rssMed: '—',
    taskSuccess: 'PASS',
    note: '3.95× vs ClawQL @12 · full tools/list + fat callTool via /mcp · mean flow from remasure',
  },
  {
    arm: 'Bifrost Code Mode',
    definitions: '3 459',
    discovery: '0',
    results: '16 518',
    combined: '19 977',
    vsDirect: '−15 025',
    flowP50: '3.9',
    flowP999: '—',
    rssMed: '—',
    taskSuccess: 'PASS',
    note: '2.25× vs ClawQL @12 (weighted 2.04×) · Layer2 includes TOOL print dump',
  },
  {
    arm: 'Obot',
    definitions: '5 520',
    discovery: '0',
    results: '29 482',
    combined: '35 002',
    vsDirect: 'match',
    flowP50: '21.7',
    flowP999: '—',
    rssMed: '—',
    taskSuccess: 'PASS',
    note: '3.95× vs ClawQL @12 · equal-arm catalog via Obot mcp-connect (remote multi-user entry)',
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

/** Interleaved n=10 000 single-call board — remasured 2026-10-17. */
export const latencyScorecardRows: LatencyScorecardRow[] = [
  {
    arm: 'ClawQL',
    highlight: true,
    e2e: '1.02 / 2.33 / 7.80 / 11.27',
    gatewayCost: '0.70 / 6.70 / 10.93',
    rssMed: '389',
    listTok: '1 240',
    invokedSchema: '178',
    resultTok: '28',
  },
  {
    arm: 'Executor',
    e2e: '2.39 / 7.86 / 10.96 / 22.78',
    gatewayCost: '2.39 / 10.96 / 22.78',
    rssMed: '255',
    listTok: '2 281',
    invokedSchema: '128',
    resultTok: '59',
  },
  {
    arm: 'MCPJungle',
    e2e: '1.37 / 6.26 / 9.01 / 14.47',
    gatewayCost: '1.05 / 8.66 / 13.62',
    rssMed: '151',
    listTok: '46',
    invokedSchema: '46',
    resultTok: '28',
  },
  {
    arm: 'agentgateway',
    e2e: '1.17 / 4.66 / 8.89 / 14.33',
    gatewayCost: '0.85 / 8.51 / 13.14',
    rssMed: '216',
    listTok: '37',
    invokedSchema: '37',
    resultTok: '28',
  },
]

export const gatewayBenchmarkHonesty = [
  {
    title: 'What we claim',
    body: 'Fewest tokens among measured MCP aggregators, Bifrost (classic + Code Mode), Obot, and live Executor v1 + v2 β with equal task success — ClawQL 8 866 combined @12 (3.38× vs Executor v2). Best p50 e2e and governed gateway cost on the remasured n=10 000 interleaved board.',
  },
  {
    title: 'What we do not claim',
    body: 'Scale-out concurrency wins (Topology B is a near-tie with MCPJungle). Memory wins. p999 latency wins (tails moved up on the remasure host). Mixing Executor v2 latency with ClawQL Bun stdio. Category-wide supremacy until remaining roadmap peers (TrueFoundry, Uber technique, …) clear the equal-arm minimum set — see /benchmarks#dominance. Bifrost 2.25× / 3.95×, Obot 3.95×, and Executor v2 3.38× are measured.',
  },
  {
    title: 'Executor version scope',
    body: 'v1.6.10: fat return, +18 704 vs baseline (53 706 combined). v2 β.15 HTTP remasure: 29 927 combined (−5 075 vs baseline) — 3.38× vs ClawQL 8 866; compact envelope credited, ClawQL still leads. Topology-A Executor chaos: HTTP /mcp 29/30 (p99 110 ms); stdio remasure still blocked (daemon Unauthorized) — historical 23/24 retained.',
  },
  {
    title: 'ClawQL transport matrix',
    body: 'Node/Bun × stdio/HTTP/gRPC on the same search→execute recipe. Tokens match across transports (8 866 after compact JSON). Fastest: Bun stdio (16.0 ms p50). HTTP is the fair peer for Executor v2 (ClawQL Node HTTP 45.9 vs Executor v2 73.5). gRPC is ClawQL-only here and slower on this small-payload board (~138 ms) — prefer it for large CallTool bodies.',
  },
  {
    title: 'Concurrency (topology A)',
    body: 'Until-break remasure: ClawQL 79/80, Executor HTTP 29/30, MCPJungle 151/152 (still leads), agentgateway 63/64. Publishable chaos claim vs Executor on topology A.',
  },
  {
    title: 'Concurrency (topology B)',
    body: '4× HTTP replicas behind sticky Node LB (cookie clawql_bench_sticky): ClawQL 121/122 ≈ MCPJungle 125/126 ≫ agentgateway 47/48. Near-tie with MJ — not a scale-out supremacy claim. Separate from ClawQL NATS fabric sticky (135). Executor HTTP ×4 still open.',
  },
  {
    title: 'Next ClawQL lever',
    body: 'Discovery is ~42% of ClawQL’s combined @12 (3 732 / 8 866). Skip-search when the agent already knows the operationId (MT_CLAWQL_DISCOVERY=once / known-op path) cuts more without touching projection. Cloudflare zone-audit tokens remasured post–compact-execute (known_op 1 710).',
  },
] as const

export const gatewayBenchmarkLinks = [
  {
    label: 'Dominance roadmap',
    href: '/benchmarks/#dominance',
    detail: 'Peers not yet on the board + minimum criteria for a category claim',
  },
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
  measuredLabel: 'Full remasure Oct 2026 · compact search+execute · MT + 10k + chaos A/B · host-bound',
  multiturnLabel: 'N=12 / C=40 fat catalog · classic Layer1-once + Σ Layer2 · Obot + Bifrost on board',
  latencyLabel: 'n=10 000 interleaved · remasured 2026-10-17',
  artifactMultiturn: 'gateway-multi-multiturn.json',
  artifactMultiturn24: 'gateway-multi-multiturn-24.json',
  artifactBifrost: 'gateway-multi-multiturn-bifrost.json',
  artifactObot: 'gateway-multi-multiturn-obot.json',
  artifactTransportMatrix: 'gateway-multi-multiturn-clawql-transport-10k.json',
  artifactExecutorV2: 'gateway-multi-multiturn-executor-v2-equal-10k.json',
  artifactLatency: 'gateway-multi-cmp-10k.json',
  artifactChaos: 'gateway-multi-cmp-chaos-slim.json',
  artifactChaosTopologyB: 'gateway-multi-cmp-chaos-topology-b.json',
} as const
