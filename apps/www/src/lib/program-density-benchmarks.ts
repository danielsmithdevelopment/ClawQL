/**
 * Infinity × ClawQL history-memory density board for clawql.com/benchmarks#program-density.
 * Source: docs/benchmarks/program-density/infinity-on-pi/
 * Claim = matched-history memory fit under 8 GiB — not full-runtime density.
 */

const GH = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

export const programDensityHeadline = 'History-memory fit under 8 GiB — ~29% more matched histories'

export const programDensitySummary =
  'Same-host, swap-disabled 8 GiB cgroup: ClawQL’s matched-shape resident history store fits 100 000 agents vs Infinity agent_scale at 77 500 (~29% more). Memory / history-storage result — not a claim that the full ClawQL durable/MCP runtime runs more agents. Peer review invited before promoting a “denser than” category line.'

export const programDensityClaim =
  'With matched Infinity-shaped 20-turn / 100-message histories under memory.max=8G and memory.swap.max=0, latency-gated lastFit is Infinity 77 500 vs ClawQL 100 000 (~29% more histories). Same 2× turn-latency gate both sides vs N=2 500 baseline. Quote within-system latency ratios only — absolute ms are not cross-comparable. Forced reclaim disclosed on both sides.'

export const programDensityMeta = {
  measuredAt: '2026-10-30',
  boardLabel: 'infinity-clawql-8g-history-density-v1',
  measuredLabel: '100k vs 77.5k · ~29% · 8 GiB · swap.max=0',
  contract: 'infinity-agent-scale-matched-v2',
  waveStep: 2500,
  memoryMaxGiB: 8,
  hostKind: 'KVM cloud-agent guest (host disclosed)',
  cpuLikely: 'Likely 5th-gen Xeon / Emerald Rapids (family 6, model 207); guest cannot confirm SKU',
  artifactClawqlFit: 'docs/benchmarks/program-density/infinity-on-pi/evidence-clawql-fit-latency.json',
  artifactInfinityFit: 'docs/benchmarks/program-density/infinity-on-pi/evidence-infinity-fit-latency.json',
  artifactHarness: 'docs/benchmarks/program-density/infinity-on-pi/evidence-harness-v2.json',
  artifactOffload: 'docs/benchmarks/program-density/infinity-on-pi/evidence-offloaded-tradeoff.json',
  statusDoc: 'docs/benchmarks/program-density/STATUS.md',
  boardReadme: 'docs/benchmarks/program-density/infinity-on-pi/README.md',
} as const

export type ProgramDensityChip = {
  id: string
  title: string
  value: string
  body: string
}

export const programDensityChips: readonly ProgramDensityChip[] = [
  {
    id: 'fit',
    title: 'Latency-gated fit',
    value: '100k vs 77.5k',
    body: 'Highest N where turn p50 and p99 stay ≤2× baseline (N=2 500). Wave step 2 500.',
  },
  {
    id: 'rss',
    title: 'RSS / agent at fit',
    value: '~79 vs ~105 KiB',
    body: 'ClawQL ~78.8 KiB · Infinity ~105.3 KiB. Prefer RSS/N; cgroup peak often saturates at memory.max.',
  },
  {
    id: 'scope',
    title: 'Claim scope',
    value: 'History memory',
    body: 'Matched-history storage under 8 GiB — not full ClawQL durable/MCP vs Infinity runtime.',
  },
] as const

export type ProgramDensityFitRow = {
  id: string
  system: string
  lastFit: string
  rssPerAgent: string
  vsInfinity: string
  highlight?: boolean
}

export const programDensityFitRows: readonly ProgramDensityFitRow[] = [
  {
    id: 'infinity',
    system: 'Infinity agent_scale',
    lastFit: '77 500',
    rssPerAgent: '~105.3 KiB',
    vsInfinity: '—',
  },
  {
    id: 'clawql',
    system: 'ClawQL matched-shape resident',
    lastFit: '100 000',
    rssPerAgent: '~78.8 KiB',
    vsInfinity: '~29% more histories',
    highlight: true,
  },
] as const

export type ProgramDensityLatencyRow = {
  id: string
  system: string
  baselineN: string
  lastFitN: string
  p50Ratio: string
  p99Ratio: string
  within2x: string
  highlight?: boolean
}

/** Within-system ratios only — do not compare absolute ms across systems. */
export const programDensityLatencyRows: readonly ProgramDensityLatencyRow[] = [
  {
    id: 'infinity',
    system: 'Infinity',
    baselineN: '2 500',
    lastFitN: '77 500',
    p50Ratio: '1.10×',
    p99Ratio: '1.04×',
    within2x: 'yes',
  },
  {
    id: 'clawql',
    system: 'ClawQL',
    baselineN: '2 500',
    lastFitN: '100 000',
    p50Ratio: '0.93×',
    p99Ratio: '1.69×',
    within2x: 'yes',
    highlight: true,
  },
] as const

export const programDensityLatencyNote =
  'Do not compare absolute turn times across systems. Infinity’s probe exercises the full agent_scale runtime round-trip; ClawQL’s probe times matched-shape driveTurn appends in the history harness. Different work — quote ratios only.'

export type ProgramDensityReclaimRow = {
  id: string
  system: string
  reclaim: string
  also: string
}

export const programDensityReclaimRows: readonly ProgramDensityReclaimRow[] = [
  {
    id: 'clawql',
    system: 'ClawQL',
    reclaim: '--expose-gc + multi-pass gc() between waves',
    also: '--max-old-space-size=8192 (required so V8 old-space can use the 8 GiB cgroup)',
  },
  {
    id: 'infinity',
    system: 'Infinity',
    reclaim: 'malloc_trim(0) after each wave (stock agent_scale)',
    also: 'glibc malloc; no jemalloc/mimalloc / MALLOC_* env',
  },
] as const

export type ProgramDensitySlopeRow = {
  id: string
  system: string
  slopeFloor: string
  history: string
  overhead: string
}

export const programDensitySlopeRows: readonly ProgramDensitySlopeRow[] = [
  {
    id: 'infinity',
    system: 'Infinity',
    slopeFloor: '102.891 KiB',
    history: '~63.9 KiB',
    overhead: '~39 KiB',
  },
  {
    id: 'clawql',
    system: 'ClawQL resident',
    slopeFloor: '100.221 KiB',
    history: '~63.1 KiB',
    overhead: '~37 KiB',
  },
] as const

export const programDensitySlopeNote =
  'Open-host slopes are roughly equal — and that equality mis-predicts ClawQL’s 8 GiB fit. Lead with measured fit under the cap, not slope × cap. ClawQL’s uncapped harness floor × 102.5k fails the harness×lastFit cross-check; do not jointly quote those two numbers.'

export type ProgramDensityOffloadRow = {
  id: string
  property: string
  clawql: string
  infinityAnalogue: string
}

export const programDensityOffloadRows: readonly ProgramDensityOffloadRow[] = [
  {
    id: 'rss',
    property: 'Resident RSS / agent',
    clawql: '~1 KiB (ids-only slope)',
    infinityAnalogue: 'In-memory idle ~103 KiB (agent_scale)',
  },
  {
    id: 'disk',
    property: 'Durable history',
    clawql: '~65.9 KiB disk / agent',
    infinityAnalogue: 'Serverless / external store (not measured here)',
  },
  {
    id: 'cache',
    property: 'Page cache',
    clawql: '~68 KiB/agent after park',
    infinityAnalogue: 'N/A for pure in-memory bench',
  },
  {
    id: 'warm',
    property: 'Warm wake',
    clawql: 'p50 ≈ 0.10 ms · p99 ≈ 0.27 ms',
    infinityAnalogue: 'Warm store hit / in-process reload',
  },
  {
    id: 'cold',
    property: 'Cold wake',
    clawql: 'p50 ≈ 0.20 ms · p99 ≈ 0.96 ms',
    infinityAnalogue: 'Cold start / store fetch (serverless story)',
  },
] as const

export const programDensityHonestyNotes: readonly { title: string; body: string }[] = [
  {
    title: 'Not a full-runtime density claim',
    body: 'Infinity’s arm is the full scripted agent_scale round-trip. ClawQL’s arm is DensityConversationRuntime matched-shape history — not the durable/MCP production stack. A fuller ClawQL arm is welcome if Infinity’s team wants that comparison.',
  },
  {
    title: '102.5k is not the headline',
    body: 'ClawQL’s RSS ramp sampled 102 500 before the next wave OOM’d. Latency was not verified there (edge probe risked a V8 heap abort). Headline stays at latency-checked 100 000.',
  },
  {
    title: 'Forced reclaim is primary',
    body: 'Both ramps force reclaim between waves. A normal deployment may fit fewer agents. A no-reclaim arm is future work, not this board.',
  },
  {
    title: 'Peer review before “denser than” marketing',
    body: 'Board is publishable with host disclosed. Under ClawQL peer-review policy, Infinity / Shadaj Laddad’s team review comes before promoting a category “denser than” claim. Pi 5 remains an extra column later.',
  },
  {
    title: 'Allocator fairness question',
    body: 'ClawQL requires --max-old-space-size=8192 under the 8 GiB cap. Fair question for Infinity: should a density operator set an allocator/heap analog (jemalloc/mimalloc, glibc M_TRIM_THRESHOLD / MALLOC_ARENA_MAX)?',
  },
] as const

export const programDensityBenchmarkLinks: readonly { href: string; label: string; detail: string }[] = [
  {
    href: `${GH}/docs/benchmarks/program-density/infinity-on-pi/README.md`,
    label: 'Board README',
    detail: 'Gates, headline, reclaim, offloaded pairing',
  },
  {
    href: `${GH}/docs/benchmarks/program-density/infinity-on-pi/evidence-clawql-fit-latency.json`,
    label: 'ClawQL fit-latency evidence',
    detail: '100k · RSS/N · within-system ratios',
  },
  {
    href: `${GH}/docs/benchmarks/program-density/infinity-on-pi/evidence-infinity-fit-latency.json`,
    label: 'Infinity fit-latency evidence',
    detail: '77.5k · RSS/N · within-system ratios',
  },
  {
    href: `${GH}/docs/benchmarks/program-density/infinity-on-pi/evidence-harness-v2.json`,
    label: 'Harness v2 evidence',
    detail: 'Open-host slopes · history integrity',
  },
  {
    href: `${GH}/docs/benchmarks/program-density/infinity-on-pi/evidence-offloaded-tradeoff.json`,
    label: 'Offloaded trade-off',
    detail: 'Disk + page cache + warm/cold wake',
  },
  {
    href: `${GH}/docs/benchmarks/program-density/STATUS.md`,
    label: 'program-density STATUS',
    detail: 'Paused Ontologiql arm · Infinity board pointer',
  },
  {
    href: 'https://github.com/hydro-project/infinity',
    label: 'Infinity (Hydro)',
    detail: 'Peer runtime under comparison',
  },
  {
    href: '/benchmarks/#dominance',
    label: 'Dominance roadmap',
    detail: 'Infinity row · peer-review before category claim',
  },
] as const
