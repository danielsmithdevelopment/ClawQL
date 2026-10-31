/**
 * Durability boards for clawql.com/benchmarks#durability.
 * Source: docs/benchmarks/durability-proof/ + program-cell-fleet-kill/ + security-suite/kill-mid-write/
 * Not a durable-execution claim — journaled program resume + at-most-once approved writes.
 */

const GH = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

export const durabilityBenchmarkHeadline = 'Programs survive a crash — without repeating writes'

export const durabilityBenchmarkSummary =
  'Journaled programs on a two-node celld fleet (Cloudflare R2) resume after SIGKILL with zero duplicate side effects on the published Tier C board. Tip pin is stock celld 0.6.3 (always-on durability gate): wedged-owner N=100 and stale-owner N=40 tip boards held with call-sent + intent visible. A stock-TTL N=1000 confirmation board is in flight before the stronger mechanism claim is restored. Interrupted in-flight writes with durable intent are marked outcome unknown — never blind-retried. Not a durable execution engine; not exactly-once delivery over HTTP.'

/** Scoped claim — every number measured (stock CELLD_TTL_MS=10000). Swap to tip v3 evidence when that board is measured+ok. */
export const durabilityBenchmarkClaim =
  'Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.'

export const durabilityBenchmarkMeta = {
  measuredAt: '2026-10-21',
  boardLabel: 'tier-c-fleet-phased-kill',
  measuredLabel: 'N=1000 · 0 duplicates · ~12s failover · R2',
  tipRuntime: 'celld',
  tipRuntimeVersion: '0.6.3',
  tipPackageLabel: 'schema v2 · N=50 · celld 0.6.3',
  storageProvider: 'cloudflare-r2',
  nodeCount: 2,
  celldTtlMs: 10_000,
  n: 1000,
  artifactPhased: 'docs/benchmarks/program-cell-fleet-kill/phased-evidence.json',
  artifactV3Tip: 'docs/benchmarks/program-cell-fleet-kill/phased-n1000-v3-correctness-availability.json',
  artifactWedgeTip: 'docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json',
  artifactStaleTip: 'docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json',
  artifactDurableWait: 'docs/benchmarks/program-cell-fleet-kill/durable-wait-stock-0.6.3-v3-partial.json',
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
    statusLabel: 'Tip package N=50',
    detail:
      'Schema v2 on celld 0.6.3: runtime/version, intent-on-resume, call-sent; wedge/stale own rows; golem/pi model sims + ClawQL lost-ack pilots measured. Real peer adapters still pending_adapter.',
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
    arm: 'clawql-file-journal @ during_call',
    status: 'measured',
    runtime: 'host-file-journal',
    idempotent: '0 dups · intent+sent (n=50)',
    nonIdempotent: '0 dups · intent+sent (n=50)',
  },
  {
    arm: 'clawql-program-celld @ during_call',
    status: 'partial (tip v3)',
    runtime: 'celld 0.6.3',
    idempotent: '—',
    nonIdempotent: 'fleet tip import · call-sent+intent so far',
  },
  {
    arm: 'clawql-program-celld @ wedged_owner',
    status: 'measured (tip)',
    runtime: 'celld 0.6.3',
    idempotent: '—',
    nonIdempotent: '100/100 call-sent+intent (own row)',
  },
  {
    arm: 'clawql-program-celld @ stale_owner',
    status: 'measured (tip)',
    runtime: 'celld 0.6.3',
    idempotent: '—',
    nonIdempotent: '40/40 ownershipMoved · 0 staleSend',
  },
  {
    arm: 'naive-retry (reference)',
    status: 'measured',
    runtime: 'host-file-journal',
    idempotent: 'Retries; unique effects masked by keys',
    nonIdempotent: 'Duplicates when upstream ignores keys',
  },
  {
    arm: 'golem-at-least-once-sim',
    status: 'measured (model sim)',
    runtime: 'golem-model-sim',
    idempotent: 'At-least-once; 1 unique effect/trial (n=50)',
    nonIdempotent: 'At-least-once; duplicates (n=50)',
  },
  {
    arm: 'pi-interrupt-sim',
    status: 'measured (model sim)',
    runtime: 'pi-interrupt-model-sim',
    idempotent: 'Tool re-entry; 1 unique effect/trial (n=50)',
    nonIdempotent: 'Tool re-entry; duplicates (n=50)',
  },
  {
    arm: 'clawql-file-journal @ lost_ack',
    status: 'measured (pilot)',
    runtime: 'host-file-journal',
    idempotent: '0 dups · unknown (no blind resend)',
    nonIdempotent: 'neither: 0 dups · unknown; lookup resolves',
  },
  {
    arm: 'golem / pi-durable (+ combos)',
    status: 'pending_adapter',
    runtime: '—',
    idempotent: '—',
    nonIdempotent: 'Real adapters not wired; sims are placeholders',
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
    body: 'When a cell dies mid-call with a durable write intent, success and “never arrived” look the same from ClawQL’s side — we record outcome unknown and do not blind-retry. Tip stock celld 0.6.3 always-on gate closed the pretends-journaled-intent path on wedged + stale-owner boards; the stock-TTL N=1000 confirmation must finish green before the stronger mechanism sentence is restored. Recovery when intent is durable: check by unique reference (after the original can no longer land), then decide; or resend with an idempotency key. Person only when neither exists.',
  },
  {
    title: 'No “exactly once” over HTTP (yet)',
    body: 'Prefer at-most-once approved writes today. Mandate-derived keys and spec-driven lookup are planned so Stripe-class / lookup-capable APIs auto-resolve in-flight unknowns — not claimed until shipped and measured. Lost-ack pilot on file-journal already shows lookup resolving without resend.',
  },
  {
    title: 'Peer boards pending invite',
    body: 'Named Golem / Pi Durable numbers wait on maintainer config. Tip package includes model-faithful sims (not real peer runtimes) so dual columns are reviewable now.',
  },
] as const

export const durabilityBenchmarkLinks: readonly { href: string; label: string; detail: string }[] = [
  {
    href: `${GH}/docs/benchmarks/durability-proof/STATUS.md`,
    label: 'STATUS — proof ladder',
    detail: 'Tiers A–F, scoped claim, tip 0.6.3 boards',
  },
  {
    href: `${GH}/docs/benchmarks/program-cell-fleet-kill/phased-evidence.json`,
    label: 'phased-evidence.json',
    detail: 'Published Tier C N=1000 board',
  },
  {
    href: `${GH}/docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json`,
    label: 'wedged-owner tip N=100',
    detail: 'Stock celld 0.6.3 · call-sent+intent',
  },
  {
    href: `${GH}/docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json`,
    label: 'stale-owner tip N=40',
    detail: '0 staleSend · ownership moved',
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
    detail: 'Schema v2 tip package · N=50',
  },
  {
    href: `${GH}/docs/streams/celld-durable-ack-latency.md`,
    label: 'durable_wait (gate latency)',
    detail: 'Stock 0.6.3 gate wait — not PUT+GET',
  },
  {
    href: `${GH}/docs/gtm/golem-overlap-and-durability-honesty.md`,
    label: 'Golem honesty',
    detail: 'Execution vs effect; collaboration pitch',
  },
] as const
