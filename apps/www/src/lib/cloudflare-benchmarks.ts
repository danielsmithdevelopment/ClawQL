/**
 * Cloudflare zone-audit multiturn board for clawql.com/benchmarks.
 * Source: docs/benchmarks/cloudflare-multiturn (publish 10k×3 + concurrency curves).
 * Host-bound — token cells from 2026-10-17 post–compact-execute remasure.
 * Concurrency curves unchanged by JSON pretty-print. Anon MB cells on the
 * publish board were measured on the October 15 side-branch; tip equal-arm
 * Bun `--smol` lean after lazy-listen restore is ~142 MB — cite that for
 * release-reproducible single-process memory (see docs/spikes/rust-dataplane/LEAN-BISECT.md).
 * Optional Cloud density path (ADR 0016): Rust clawql-dataplane execute-plane
 * plateau ~15.8 MB on the governed CF known-op board — cite that row, not Bun+Rust sum.
 */

export const cfTokenBoardProvenance = {
  status: 'current' as const,
  measuredAt: '2026-10-17',
  artifact: 'docs/benchmarks/cloudflare-multiturn/board-summary-n10000-r3.json',
  note: 'Post–compact-execute 3×10k: known_op 1710 (−123 vs 1833); program/Executor/peers unchanged',
} as const

/** Governed density board — optional Rust execute plane (ADR 0016 dual-process). */
export const cfDensityBoardProvenance = {
  status: 'current' as const,
  measuredAt: '2026-10-23',
  comparisonLabel: 'governance' as const,
  artifact: 'docs/benchmarks/gateway-multi-comparison/dataplane-week1-gov-3x10k.json',
  note: 'Fair CF known-op 3×10k remasure: Bun plateau med ~127.9 MB vs Rust dataplane ~15.8 MB (~8.1×); call p999 tied. Cite execute-plane RSS only.',
} as const

export const cfBenchmarkHeadline = 'Cloudflare boards — zone-audit, fan-out/join, concurrency.'

export const cfBenchmarkSummary =
  'Zone-audit: ClawQL known-op leads tokens on a curated OpenAPI → replay mock — post–compact-execute remasure 2026-10-17: known_op 1 710 weighted (−123). Optional Rust dataplane density path leads memory (~15.8 MB execute-plane vs peers ~99–102 MB). Fan-out/join: scripted program claim cleared; blind real-model gate is frontier-only so far. Executor v2 is the promoted Executor column. HTTP concurrency is multiplex; stdio is process-per-client.'

export const cfBenchmarkMeta = {
  measuredLabel:
    'Tokens remasured Oct 2026 (compact execute) · Density path ~15.8 MB execute-plane (2026-10-23) · Tip Bun lean ~142 MB single-process',
  boardLabel: '10 000 sessions × 3 reps · curated Cloudflare OpenAPI',
  artifactBoard: 'docs/benchmarks/cloudflare-multiturn/board-final-summary.md',
  artifactDensity: 'docs/benchmarks/gateway-multi-comparison/dataplane-week1-gov-3x10k.json',
  artifactHttp: 'docs/benchmarks/cloudflare-multiturn/http-concurrency-curves.json',
  artifactStdio: 'docs/benchmarks/cloudflare-multiturn/stdio-concurrency-curves.json',
} as const

export type CfTokenRow = {
  arm: string
  highlight?: boolean
  weighted: string
  taskSuccess: string
  sessionP50: string
  transport: string
  anonMb: string
  note?: string
}

/** Tokens + session latency + memory (headline board). Density row = execute-plane RSS. */
export const cfTokenRows: CfTokenRow[] = [
  {
    arm: 'ClawQL known-op (Rust dataplane)',
    highlight: true,
    weighted: '1 710',
    taskSuccess: '1.0',
    sessionP50: '~13.9 ms†',
    transport: 'HTTP',
    anonMb: '~15.8',
    note: 'Optional Cloud density path (ADR 0016) — governed execute-plane plateau. Same known-op tokens as Bun host. †Session p50 on density board (11-step CF known-op), not the multiturn fill.',
  },
  {
    arm: 'ClawQL known-op',
    highlight: true,
    weighted: '1 710',
    taskSuccess: '1.0',
    sessionP50: '24.6 ms',
    transport: 'HTTP',
    anonMb: '~121*',
    note: 'Default Bun/TS host — execute by operationId + where (−123 vs pre-compact). *Anon MB: October 15 Node-256 fill; tip Bun lean ~128–142 MB',
  },
  {
    arm: 'ClawQL program',
    highlight: true,
    weighted: '5 187',
    taskSuccess: '1.0',
    sessionP50: '11.8 ms',
    transport: 'HTTP',
    anonMb: '~126*',
    note: 'One execute_program plan (ADR 0015 v0). *Anon MB: October 15 build',
  },
  {
    arm: 'ClawQL compact search',
    weighted: '5 802',
    taskSuccess: '1.0',
    sessionP50: '46.8 ms',
    transport: 'HTTP',
    anonMb: '~123*',
    note: '−123 vs pre-compact 5 925. *Anon MB: October 15 build',
  },
  {
    arm: 'ClawQL default search',
    weighted: '17 698',
    taskSuccess: '1.0',
    sessionP50: '58.9 ms',
    transport: 'HTTP',
    anonMb: '~125*',
    note: '−123 vs pre-compact 17 821. *Anon MB: October 15 build',
  },
  {
    arm: 'Executor v2 (promoted)',
    weighted: '5 328',
    taskSuccess: '1.0',
    sessionP50: '~218 ms',
    transport: 'HTTP',
    anonMb: '~2 103',
    note: 'Main Executor comparison column · OpenAPI tools → mock',
  },
  {
    arm: 'Executor v1 (stable 1.6.10)',
    weighted: '8 236',
    taskSuccess: '1.0',
    sessionP50: '~84 ms',
    transport: 'stdio',
    anonMb: '~535',
    note: 'Same mock workload · mcp + daemon · not in HTTP concurrency table · tokens not re-run',
  },
  {
    arm: 'MCPJungle',
    weighted: '55 121',
    taskSuccess: '1.0',
    sessionP50: '50.5 ms',
    transport: 'HTTP',
    anonMb: '~102',
  },
  {
    arm: 'agentgateway',
    weighted: '54 705',
    taskSuccess: '1.0',
    sessionP50: '49.3 ms',
    transport: 'HTTP',
    anonMb: '~99',
  },
  {
    arm: 'Direct REST',
    weighted: '47 361',
    taskSuccess: '1.0',
    sessionP50: '40.0 ms',
    transport: 'HTTP',
    anonMb: '—',
    note: 'No gateway — raw calls to mock',
  },
  {
    arm: 'Cloudflare code-mode',
    weighted: '3 947',
    taskSuccess: '1.0',
    sessionP50: '—',
    transport: 'HTTP',
    anonMb: '—',
    note: 'Same zone-audit board · peer under known-op (1 710) and program (5 187)',
  },
]

export type CfConcRow = {
  arm: string
  highlight?: boolean
  at100: string
  at250: string
  at500: string
  peakRps: string
  note?: string
}

/** Streamable HTTP multiplex — N clients sharing one server. */
export const cfHttpConcRows: CfConcRow[] = [
  {
    arm: 'ClawQL Bun --smol',
    highlight: true,
    at100: '82',
    at250: '211',
    at500: '434',
    peakRps: '1 854',
  },
  {
    arm: 'ClawQL Node 256',
    highlight: true,
    at100: '33',
    at250: '112',
    at500: '224',
    peakRps: '675',
  },
  {
    arm: 'agentgateway',
    at100: '33',
    at250: '88',
    at500: '112†',
    peakRps: '833',
    note: '† Host OOM at 128 before p99 cleared 500 ms — last sustained point',
  },
  {
    arm: 'MCPJungle',
    at100: '34',
    at250: '92',
    at500: '192',
    peakRps: '476',
  },
  {
    arm: 'Executor v2',
    at100: '2',
    at250: '10',
    at500: '22',
    peakRps: '73',
  },
]

/** Stdio process-per-client — fair topology for Executor v1. */
export const cfStdioConcRows: CfConcRow[] = [
  {
    arm: 'ClawQL known-op (stdio)',
    highlight: true,
    at100: '31',
    at250: '74',
    at500: '122',
    peakRps: '1 145',
    note: 'Total anon @100 ms ≈ 3.4 GB (all client processes)',
  },
  {
    arm: 'Executor v1 stable (stdio)',
    at100: '8',
    at250: '19',
    at500: '42',
    peakRps: '123',
    note: 'Total anon @100 ms ≈ 2.0 GB · single-client board ≈ 535 MB',
  },
]

export const cfBenchmarkHonesty = [
  {
    title: 'What we claim',
    body: 'On this Cloudflare board, ClawQL known-op has the fewest weighted tokens (1 710 after compact execute, −123 vs 1 833). Optional Rust dataplane density path leads memory at ~15.8 MB execute-plane RSS (governed CF known-op 3×10k) versus MCPJungle ~102 MB and agentgateway ~99 MB — do not add Bun host RSS to that cite. Default Bun/TS host remains ~121 MB on the Node-256 fill (~128–142 MB tip lean). Executor v2 is the promoted Executor peer (5 328 tokens, ~2.1 GB).',
  },
  {
    title: 'Dual-process memory scope',
    body: 'Density numbers are the Rust clawql-dataplane process only (known-op execute + governance). Search, plugins, and memory stay on the Bun/TS host. Unset CLAWQL_DATAPLANE_EXECUTE_URL for single-process installs.',
  },
  {
    title: 'Two concurrency topologies',
    body: 'HTTP table = N clients sharing one Streamable HTTP server. Stdio table = one MCP process per client (fair for Executor v1). Do not mix the cells.',
  },
  {
    title: 'Session latency transports',
    body: 'ClawQL known-op 24.6 ms and program 11.8 ms are HTTP multiturn board figures (2026-10-17 remasure). Density-row ~13.9 ms is the governed known-op density board session p50. Executor v1 ~84 ms is stdio. Executor v2 ~218 ms is HTTP. Label the transport when comparing.',
  },
] as const

/* ── Fan-out / join board (ADR 0015 program promotion) ─────────────────── */

export const fanoutBenchmarkMeta = {
  measuredLabel: 'Measured Oct 2026 · host-bound',
  scriptedLabel: '3 × 10 000 scripted sessions · known-op vs program',
  gateLabel: 'Blind Cursor Task gate · N=50 / arm / model · frozen cf-mt-fanout-real-model-gate-v1',
  artifactScripted: 'docs/benchmarks/cloudflare-multiturn/fanout-join/board-summary-n10000-r3.json',
  artifactGate: 'docs/benchmarks/cloudflare-multiturn/fanout-join/real-model-cursor-gate-frontier_small.json',
  claimScripted: 'program_beats_known_op_on_fanout_join',
  claimReal: 'program_beats_known_op_on_fanout_join_for_real_models',
} as const

export type FanoutScriptedRow = {
  arm: string
  highlight?: boolean
  weighted: string
  turns: string
  taskSuccess: string
  note?: string
}

/** Scripted 3×10k fan-out board — program clears turns + token promotion. */
export const fanoutScriptedRows: FanoutScriptedRow[] = [
  {
    arm: 'ClawQL known-op',
    weighted: '2 694',
    turns: '6',
    taskSuccess: '1.0',
    note: 'Six sequential execute + client-side workers⋈routes join',
  },
  {
    arm: 'ClawQL program',
    highlight: true,
    weighted: '2 651',
    turns: '1',
    taskSuccess: '1.0',
    note: 'One execute_program · return:true compact merge · claim cleared all 3 reps',
  },
  {
    arm: 'Cloudflare code-mode',
    weighted: '—',
    turns: '1',
    taskSuccess: '1.0',
    note: 'Tokens-only peer on this publish set (not the claim arm)',
  },
]

export type FanoutGateRow = {
  model: string
  arm: string
  highlight?: boolean
  wMed: string
  wP90: string
  turns: string
  taskSuccess: string
  modelWin: string
  note?: string
}

/**
 * Blind dual-model gate (claim50v2). Dual headline not cleared — report frontier only
 * (`single_model_only`). Small loses weighted median/p90 (lean known-op obs vs ~414 plan code).
 */
export const fanoutGateRows: FanoutGateRow[] = [
  {
    model: 'Frontier (gpt-5.6-sol-medium)',
    arm: 'known-op',
    wMed: '2 813',
    wP90: '2 878',
    turns: '6.02',
    taskSuccess: '1.0',
    modelWin: '—',
  },
  {
    model: 'Frontier (gpt-5.6-sol-medium)',
    arm: 'program',
    highlight: true,
    wMed: '2 653',
    wP90: '2 732',
    turns: '1',
    taskSuccess: '1.0',
    modelWin: 'Win',
    note: 'Median + p90 + turns + success — model win',
  },
  {
    model: 'Small (composer-2.5-fast)',
    arm: 'known-op',
    wMed: '2 554',
    wP90: '2 596',
    turns: '6',
    taskSuccess: '1.0',
    modelWin: '—',
    note: 'Very lean observations (~294 mean) — hard bar for program',
  },
  {
    model: 'Small (composer-2.5-fast)',
    arm: 'program',
    wMed: '2 687',
    wP90: '2 739',
    turns: '1',
    taskSuccess: '1.0',
    modelWin: 'Loss (tokens)',
    note: 'Turns win; ~414 code tokens ×5 outweigh the one-turn obs save',
  },
]

export const fanoutBenchmarkHonesty = [
  {
    title: 'Scripted claim cleared',
    body: 'program_beats_known_op_on_fanout_join wins all three 10 000-iter reps (turns 1 vs 6 + weighted tokens). Inventory card: ssl, A-count, workers, routes join, buckets, enabled-firewall count.',
  },
  {
    title: 'Real-model: frontier only',
    body: 'Blind Cursor Task N=50 under frozen rules. Frontier program beats known-op on median + p90 weighted tokens. Small does not — dual-model headline stays open (single_model_only / report frontier).',
  },
  {
    title: 'Not the zone-audit board',
    body: 'Fan-out is a different workflow (six reads + join). Zone-audit numbers above stay the filter/known-op story. Do not mix the two boards’ weighted means.',
  },
] as const
