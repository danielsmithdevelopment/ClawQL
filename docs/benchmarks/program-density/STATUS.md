# Durable-agent density — cross-system comparison

**Status:** Under-load sync ≈ probe on both sides. ClawQL cycle stages show sync dominates the flush (~156 µs of ~174 µs); the gap vs serial is not “slow fsync under load.” Pure **durable drain ~321k/s** while the 1s-SLA ramp can print **~636k/s** — the cliff is a **latency / scheduling** limit (wait-to-pop), not writer saturation. Report both numbers. Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Two board numbers (required)

| Number                                | ClawQL (this host)         | Meaning                                               |
| ------------------------------------- | -------------------------- | ----------------------------------------------------- |
| **durableRecordsPerSec**              | **~321k/s**                | Pure drain of already-due deadlines (ignore lateness) |
| **rateSustainableWithinOneSecondSla** | **~636k/s** (±0.6% refine) | Highest arrival rate with ≥99% fires within 1s        |

`drain / sustained ≈ 0.50` → SLA rate uses the one-second slack; it is **not** the writer ceiling. Campaign headlines that only quote the SLA ramp mis-label a latency cliff as durable throughput.

## Cycle stages (per flush batch)

| Stage              | Mean          | Share of observed fsync period (~0.20 ms) |
| ------------------ | ------------- | ----------------------------------------- |
| write              | ~11 µs        | ~5%                                       |
| sync (fsync await) | ~156 µs       | ~78%                                      |
| ack                | ~6 µs         | ~3%                                       |
| inter-flush gap    | ~1 µs (drain) | ≈0 (double-buffer full)                   |
| non-sync residual  | —             | **~22%**                                  |

Sync is not 2–4× slower under load. Time “between syncs” in earlier ~3.3k fsync/s focus windows was mostly **the pump not feeding the writer at full drain**, not a mysterious 180–300 µs inside the journal.

## Lateness at the cliff (~640k/s offered)

| Split (late fires only) | Mean        |
| ----------------------- | ----------- |
| waitToPop               | **~307 ms** |
| waitForBatch            | ~0.13 ms    |
| sync                    | ~0.14 ms    |
| waitForDurable          | ~0.15 ms    |

Late work is almost entirely **waiting to be popped** (scheduler backlog), not disk.

## Prealloc / journal config (disclose each side’s best)

| System     | Best on its host                         | Notes                                                                   |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| ClawQL     | **fsync append** (board default)         | fdatasync/prealloc ~+2–3.5% here — neutral                              |
| Ontologiql | **fdatasync + 256 MiB prealloc** (~+31%) | Host/FS difference; label `prealloc_partial_lift_residual_durable_path` |

Each system runs its best disclosed config on the **shared** campaign host (same FS), then compare.

## Shared-host campaign

```bash
npm run benchmark:program-density-fsync-ceiling
npm run benchmark:program-density-fsync-metadata-arms
npm run benchmark:program-density-drain-vs-sustained
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

Board floor until campaign: ClawQL **256k** 3-rep (SLA ramp). Publish **both** durable drain and SLA-sustainable on the shared host.

## Board snapshot

| System           | Status                                                  | Notes                   |
| ---------------- | ------------------------------------------------------- | ----------------------- |
| Ontologiql       | Lab; prealloc helps +31% on their host; dbuf unverified | Same drain vs SLA split |
| ClawQL           | Drain vs SLA labeled; cycle stages shipped              | Campaign-ready          |
| Golem / Infinity | Pending invite                                          | fair-v2 / SHARED_HOST   |
