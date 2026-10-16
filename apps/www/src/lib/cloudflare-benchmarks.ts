/**
 * Cloudflare zone-audit multiturn board for clawql.com/benchmarks.
 * Source: docs/benchmarks/cloudflare-multiturn (publish 10k×3 + concurrency curves).
 * Host-bound — update when board-final-summary.md is remeasured.
 */

export const cfBenchmarkHeadline = 'Cloudflare zone-audit board — tokens, memory, concurrency.'

export const cfBenchmarkSummary =
  'Same 12-step zone audit on a curated OpenAPI → replay mock. ClawQL known-op leads tokens and memory. Executor v2 (promoted beta) is the main Executor column; v1 stable is measured on the same workload. HTTP concurrency is multiplex; stdio concurrency is a separate process-per-client table.'

export const cfBenchmarkMeta = {
  measuredLabel: 'Measured Oct 2026 · host-bound',
  boardLabel: '10 000 sessions × 3 reps · curated Cloudflare OpenAPI',
  artifactBoard: 'docs/benchmarks/cloudflare-multiturn/board-final-summary.md',
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

/** Tokens + session latency + single-process memory (headline board). */
export const cfTokenRows: CfTokenRow[] = [
  {
    arm: 'ClawQL known-op',
    highlight: true,
    weighted: '1 833',
    taskSuccess: '1.0',
    sessionP50: '23.8 ms',
    transport: 'HTTP',
    anonMb: '~121',
    note: 'Execute by operationId + where — primary ClawQL path',
  },
  {
    arm: 'ClawQL program',
    highlight: true,
    weighted: '5 187',
    taskSuccess: '1.0',
    sessionP50: '11.2 ms',
    transport: 'HTTP',
    anonMb: '~126',
    note: 'One execute_program plan (ADR 0015 v0)',
  },
  {
    arm: 'ClawQL compact search',
    weighted: '5 925',
    taskSuccess: '1.0',
    sessionP50: '—',
    transport: 'HTTP',
    anonMb: '~123',
  },
  {
    arm: 'ClawQL default search',
    weighted: '17 821',
    taskSuccess: '1.0',
    sessionP50: '—',
    transport: 'HTTP',
    anonMb: '~125',
  },
  {
    arm: 'Executor v2 (promoted)',
    weighted: '5 328',
    taskSuccess: '1.0',
    sessionP50: '~216 ms',
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
    note: 'Same mock workload · mcp + daemon · not in HTTP concurrency table',
  },
  {
    arm: 'MCPJungle',
    weighted: '55 121',
    taskSuccess: '1.0',
    sessionP50: '—',
    transport: 'HTTP',
    anonMb: '~102',
  },
  {
    arm: 'agentgateway',
    weighted: '54 705',
    taskSuccess: '1.0',
    sessionP50: '—',
    transport: 'HTTP',
    anonMb: '~99',
  },
  {
    arm: 'Direct REST',
    weighted: '47 361',
    taskSuccess: '1.0',
    sessionP50: '—',
    transport: 'HTTP',
    anonMb: '—',
    note: 'No gateway — raw calls to mock',
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
    body: 'On this Cloudflare board, ClawQL known-op has the fewest weighted tokens (1 833) and ~121 MB anon. Executor v2 is the promoted Executor peer (5 328 tokens, ~2.1 GB). Executor v1 stable on the same mock is 8 236 tokens and ~535 MB — the beta excuse does not reverse the token story.',
  },
  {
    title: 'Two concurrency topologies',
    body: 'HTTP table = N clients sharing one Streamable HTTP server. Stdio table = one MCP process per client (fair for Executor v1). Do not mix the cells.',
  },
  {
    title: 'Session latency transports',
    body: 'ClawQL known-op 23.8 ms and program 11.2 ms are HTTP board figures. Executor v1 ~84 ms is stdio. Executor v2 ~216 ms is HTTP. Label the transport when comparing.',
  },
] as const
