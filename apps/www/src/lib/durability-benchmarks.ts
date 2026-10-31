/**
 * Durability boards for clawql.com/benchmarks#durability.
 * Source: docs/benchmarks/durability-proof/ + program-cell-fleet-kill/ + security-suite/kill-mid-write/
 * Not a durable-execution claim — journaled program resume + at-most-once approved writes.
 */

const GH = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

export const durabilityBenchmarkHeadline = 'Programs survive a crash — without repeating writes'

export const durabilityBenchmarkSummary =
  'Journaled programs on a two-node celld fleet (Cloudflare R2) resume after SIGKILL with zero duplicate side effects on the published Tier C board. Interrupted in-flight writes are marked outcome unknown for a person to resolve. Caveat: intent durability before the outbound call under peer kill is under active hardening (celld lacks Cloudflare-style output gates); see durability STATUS. Not a durable execution engine; not exactly-once delivery over HTTP.'

/** Scoped claim — every number measured (stock CELLD_TTL_MS=10000). */
export const durabilityBenchmarkClaim =
  'Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.'

export const durabilityBenchmarkMeta = {
  measuredAt: '2026-10-21',
  boardLabel: 'tier-c-fleet-phased-kill',
  measuredLabel: 'N=1000 · 0 duplicates · ~12s failover · R2',
  storageProvider: 'cloudflare-r2',
  nodeCount: 2,
  celldTtlMs: 10_000,
  n: 1000,
  artifactPhased: 'docs/benchmarks/program-cell-fleet-kill/phased-evidence.json',
  artifactTtlTradeoff: 'docs/benchmarks/program-cell-fleet-kill/ttl-tradeoff-evidence.json',
  artifactKillMid: 'docs/benchmarks/security-suite/kill-mid-write/evidence.json',
  artifactComparison: 'docs/benchmarks/durability-proof/comparison/evidence.json',
  statusDoc: 'docs/benchmarks/durability-proof/STATUS.md',
  harnessFleet: 'scripts/benchmarks/fleet-phased-kill/',
  harnessKillMid: 'scripts/benchmarks/security-suite/kill-mid-write/',
} as const

export type DurabilityColumnChip = {
  id: string
  title: string
  value: string
  body: string
}

/** Three columns published with every crash board. */
export const durabilityColumnChips: readonly DurabilityColumnChip[] = [
  {
    id: 'safety',
    title: 'Safety',
    value: '0 duplicates',
    body: 'Rule-of-three 95% upper bound 0.3% at N=1000. Never repeated a write.',
  },
  {
    id: 'uncertainty',
    title: 'Uncertainty',
    value: '481 outcome unknown',
    body: 'Aggregate ~48% is a targeting artifact — see per-phase table. Explicit, not silent; auto-resolve via keys/lookup is planned.',
  },
  {
    id: 'availability',
    title: 'Availability',
    value: '0.6% fences · 0.9% deadline',
    body: '6 survivor self-fences, 9 resume deadline misses. Stated, not hidden. Resume p50 ≈ 12s (lease TTL).',
  },
] as const

export type DurabilityPhaseRow = {
  phase: string
  n: number
  outcomeUnknown: number
  rateLabel: string
  note: string
}

export const durabilityPhaseRows: readonly DurabilityPhaseRow[] = [
  {
    phase: 'Before the approval is consumed',
    n: 252,
    outcomeUnknown: 0,
    rateLabel: '0%',
    note: 'Must stay 0 — nonzero is a bug',
  },
  {
    phase: 'After intent recorded',
    n: 248,
    outcomeUnknown: 240,
    rateLabel: '~96.8%',
    note: 'In-flight window',
  },
  {
    phase: 'During the call',
    n: 251,
    outcomeUnknown: 241,
    rateLabel: '~96.0%',
    note: 'In-flight window',
  },
  {
    phase: 'After the call, before journaling',
    n: 249,
    outcomeUnknown: 0,
    rateLabel: '0%',
    note: 'Must stay 0 — nonzero is a bug',
  },
] as const

export const durabilityPhaseFraming =
  'Kills are aimed evenly at four phases; two are the brief in-flight window where the API’s reply never arrived. When a durable write intent is present, marking that window outcome unknown is honesty — not a durability failure. A mid-flight kill with no durable intent is a durability defect (under hardening). Prefer check-by-reference or idempotency keys before involving a person (planned).'

export type DurabilityLadderRow = {
  tier: string
  name: string
  status: 'measured' | 'planned' | 'pending'
  statusLabel: string
  detail: string
}

export const durabilityLadderRows: readonly DurabilityLadderRow[] = [
  {
    tier: 'A',
    name: 'File-journal SIGKILL',
    status: 'measured',
    statusLabel: 'CI-gated',
    detail: 'Resume after kill; writes outcome_unknown; no re-send.',
  },
  {
    tier: 'B',
    name: 'ProgramCellDO isolate SIGKILL',
    status: 'measured',
    statusLabel: 'CI when streams-celld fires',
    detail: 'Same contract on celld Durable Object journal.',
  },
  {
    tier: 'C',
    name: 'Fleet peer kill (R2)',
    status: 'measured',
    statusLabel: 'N=1000 phased',
    detail: 'Two nodes, LTX diagnose OK, three columns + failover seconds.',
  },
  {
    tier: 'D',
    name: 'Kill-mid-write (mandate)',
    status: 'measured',
    statusLabel: 'CI N=50',
    detail: 'duplicate_side_effects=0 on file-journal board.',
  },
  {
    tier: 'D+',
    name: 'Dual-column comparison',
    status: 'measured',
    statusLabel: 'ClawQL arms',
    detail:
      'Schema v2 tip package (celld 0.6.3): +runtime/version, intent-on-resume, call-sent. Peers pending invite; N=50 pilots then review.',
  },
  {
    tier: 'F',
    name: 'Resume vs journal length',
    status: 'planned',
    statusLabel: 'Planned',
    detail: 'Measure resume wall time at short vs long journals; snapshots if needed.',
  },
] as const

export type DurabilityTtlRow = {
  id: string
  label: string
  status: 'measured' | 'planned'
  n: number | null
  nLabel: string
  duplicates: number | null
  failoverAboutSec: number | null
  note: string
}

export const durabilityTtlRows: readonly DurabilityTtlRow[] = [
  {
    id: 'stock',
    label: 'Stock CELLD_TTL_MS=10000 (R2)',
    status: 'measured',
    n: 1000,
    nLabel: '1000',
    duplicates: 0,
    failoverAboutSec: 12,
    note: 'Preferred publish row. Renew ~⅓ TTL.',
  },
  {
    id: 'ttl30',
    label: 'TTL-only stretch 30000',
    status: 'measured',
    n: 40,
    nLabel: '40',
    duplicates: 0,
    failoverAboutSec: 32,
    note: 'Tradeoff demo only — label sample size. Not preferred production.',
  },
  {
    id: 'preferred',
    label: 'Preferred production (renew ⅕ + regional leases)',
    status: 'planned',
    n: null,
    nLabel: '—',
    duplicates: null,
    failoverAboutSec: null,
    note: 'Target, not a result. Run at stock N before claiming.',
  },
] as const

export type DurabilityComparisonArm = {
  arm: string
  status: string
  runtime: string
  idempotent: string
  nonIdempotent: string
}

export const durabilityComparisonArms: readonly DurabilityComparisonArm[] = [
  {
    arm: 'clawql-file-journal',
    status: 'measured',
    runtime: 'host-file-journal',
    idempotent: '0 dups · intent+sent (n=20)',
    nonIdempotent: '0 dups · intent+sent (n=20)',
  },
  {
    arm: 'clawql-program-celld',
    status: 'measured (tip)',
    runtime: 'celld 0.6.3',
    idempotent: 'fleet tip · see package',
    nonIdempotent: 'wedge 100/100 call-sent+intent',
  },
  {
    arm: 'naive-retry (reference)',
    status: 'measured',
    runtime: 'host-file-journal',
    idempotent: 'Retries; unique effects masked by keys',
    nonIdempotent: 'Duplicates when upstream ignores keys',
  },
  {
    arm: 'golem / pi-durable (+ combos)',
    status: 'pending invite',
    runtime: '—',
    idempotent: '—',
    nonIdempotent: '—',
  },
] as const

export const durabilityHonestyNotes: readonly { title: string; body: string }[] = [
  {
    title: 'Not a durable execution engine',
    body: 'Golem-class mid-function resume of arbitrary agent code is a different product. ClawQL journals programs and governs approved writes.',
  },
  {
    title: 'Execution vs effect durability',
    body: 'A runtime can make the program survive a crash. Remote POSTs still need upstream idempotency — or at-most-once governance. ClawQL chooses at most once for consequential writes.',
  },
  {
    title: 'Outcome unknown vs lost intent',
    body: 'When a cell dies mid-call with a durable write intent, success and “never arrived” look the same from ClawQL’s side — we record outcome unknown and do not blind-retry that intent. If durable intent is missing, resume can re-run the write (double-charge risk); that gap is under active hardening (celld output-gate / lease-epoch fencing) and is not claimed fixed. Recovery when intent is durable: check by unique reference (after the original can no longer land), then decide; or resend with an idempotency key. Person only when neither exists.',
  },
  {
    title: 'No “exactly once” over HTTP (yet)',
    body: 'Prefer at-most-once approved writes today. Mandate-derived keys and spec-driven lookup are planned so Stripe-class / lookup-capable APIs auto-resolve in-flight unknowns — not claimed until shipped and measured.',
  },
  {
    title: 'Peer boards pending invite',
    body: 'Named Golem / Pi Durable numbers wait on maintainer config. ClawQL-only crash evidence is public here.',
  },
] as const

export const durabilityBenchmarkLinks: readonly { href: string; label: string; detail: string }[] = [
  {
    href: `${GH}/docs/benchmarks/durability-proof/STATUS.md`,
    label: 'STATUS — proof ladder',
    detail: 'Tiers A–F, scoped claim, outreach framing',
  },
  {
    href: `${GH}/docs/benchmarks/program-cell-fleet-kill/phased-evidence.json`,
    label: 'phased-evidence.json',
    detail: 'N=1000 Tier C machine-readable board',
  },
  {
    href: `${GH}/docs/benchmarks/program-cell-fleet-kill/AVAILABILITY.md`,
    label: 'AVAILABILITY.md',
    detail: 'Lease TTL, per-phase unknown, three columns',
  },
  {
    href: `${GH}/docs/benchmarks/program-cell-fleet-kill/TTL-TRADEOFF.md`,
    label: 'TTL-TRADEOFF.md',
    detail: 'Stock vs ttl30 vs preferred (planned)',
  },
  {
    href: `${GH}/docs/benchmarks/security-suite/kill-mid-write/evidence.json`,
    label: 'kill-mid-write evidence',
    detail: 'Tier D CI N=50 · 0 duplicate side effects',
  },
  {
    href: `${GH}/docs/benchmarks/durability-proof/comparison/evidence.json`,
    label: 'comparison evidence',
    detail: 'Dual columns × upstream modes',
  },
  {
    href: `${GH}/docs/gtm/golem-overlap-and-durability-honesty.md`,
    label: 'Golem honesty',
    detail: 'Execution vs effect; collaboration pitch',
  },
] as const
