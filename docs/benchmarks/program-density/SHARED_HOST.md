# Shared-host contract — durable-agent density

Run both systems on **one host**, same agent shape, same columns, before any win copy.
Methodology is aligned on both sides (ClawQL PR #1433; Ontologiql #144 + compact-array rebuild). Evidence below is still **different hosts** until the shared run.

## Shared-host campaign protocol (required before merge)

Settle these **before** either system’s deadline arms on the shared host. Results are not board-comparable without them.

### 1. Three-repetition floor for headlines

- Run the **sustained-rate ramp** (and scaled-burst first-miss) **three times per system**.
- Publish **`min(reps)`** (the floor) as each system’s headline `sustainablePerSec` / `firstRateMissingSlaPerSec` / `scaledBurstFirstMissSize`.
- Keep per-rep arrays in the artifact for transparency.
- **Do not** compare one system’s single run to the other’s 3-rep floor.
- Crash test and deadline restart may stay single-shot; rate headlines must use the floor.

### 2. Single-writer fsync ceiling first (both systems, same probe)

Before ClawQL or Ontologiql runs:

```bash
npm run benchmark:program-density-fsync-ceiling
# → docs/benchmarks/program-density/fsync-ceiling.json
```

The artifact keeps **two** modes:

| Mode                      | Pattern                                                            | Use                                                                                               |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **`serial` (PRIMARY)**    | One writer; write a `batchMax` NDJSON batch; `fsync`; wait; repeat | Ceiling for this flush policy. `theoreticalMaxGroupCommitPerSec = serial.fsyncsPerSec × batchMax` |
| **`parallel` (headroom)** | Several writers with fsync each                                    | What a multi-writer design could use — **not** the board ceiling                                  |

**Ontologiql must run the same serial probe** on the shared host. An earlier ~40k fsync/s figure came from overwrite/parallel-capable probing and **overstated** single-writer capacity — retracted as the group_commit ceiling.

#### Serial-ceiling honesty (power-loss vs process crash)

A serial rate near **tens of thousands** of fsyncs/sec (~20 µs each) is often **not** true media durability: hypervisor write cache, volatile drive cache, or similar. ClawQL’s cloud-agent host measured ~126 µs/fsync (~7.9k/s) — still check the campaign disk. Record in evidence:

- How the probe ran (serial board-matched)
- Observed `meanFsyncLatencyMs` / `fsyncsPerSec`
- Disk / VM write-cache settings (e.g. cache mode, `barrier`, vendor notes)

SIGKILL crash tests prove durability against a **process** crash; OS and disk caches survive. They cannot catch early-ack fsync. The interleaved campaign must run on the **dedicated** host with cache behavior checked and recorded. An inflated serial ceiling makes “% of ceiling” understate how close a system is to the true limit.

Read each system’s `sustainablePerSec` as a **fraction of the serial ceiling** only after that honesty check.

### 2b. Record fsyncs/sec + avg batch size during the run

During each system’s ramp (same window as the rate arms), record:

| Number                                     | If…                                  | Reading                                                                                                    |
| ------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **fsyncsPerSec** near serial ceiling       | and **avgBatchSize** ≪ `batchMax`    | Disk busy; batches flushing early (10 ms timer / empty queue)                                              |
| **fsyncsPerSec** well below serial ceiling | and **avgBatchSize** near `batchMax` | Writer idle between syncs (builds next batch only after fsync returns) — double-buffering is the usual fix |

ClawQL surfaces these as `flushStats` (`npm run benchmark:program-density-flush-stats`) plus a pump profile (`npm run benchmark:program-density-pump-profile`).

**Reading after both pump profiles:** producers are fast on both sides (ClawQL noop ~1.3M/s; Ontologiql producer ~0.46 µs/rec). Double-buffer hits alone do not prove an idle-writer fix (ClawQL fsync rate flat; Ontologiql = `double_buffer_candidate_unverified`).

**Under-load sync latency vs probe (required):** record each sync’s p50/p99 during the focus window and compare to the serial probe. If run latency is **2–4×** the probe, growing-file metadata (size/blocks on every `fsync`) is the likely gap — trial **`fdatasync` + preallocated segments** and report before/after **sustained rate + fsyncs/sec** (not hit rate).

**ClawQL (done on this host):** same-campaign 3-rep drain **~312k** ≈ sustained **~312k** (ratio **1.01**, ranges overlap) — `sustained_equals_drain_within_measurement_error`. Sync p50/p99 ~129/**679** µs; ack ~2.5 µs.

**Ontologiql (post ack+dbuf):** drain **320k**, sustained only **185k** (ratio ~0.58) — **scheduler-bound**, same signature ClawQL fixed with pop-all-due + ≤1ms coalesce + no idle-sleep while busy. Conc 256 maximized drain; hit ~35%.

**Board pause:** shared-host deadline run can wait. Infinity same-host density columns are recorded under `infinity-on-pi/` (Pi hardware deferred).

### 3. Refine the ramp (binary search + resolution + steady state)

Coarse ladders (e.g. 192k→256k or 256k→384k) only place the limit in a **33–50%** band; those bands overlap across systems.

- **Continuous arrivals** for each step (not a short place-ahead burst). Default step **≥30s**.
- **Fail a step whose overdue backlog is still growing** in the final stretch, even if pctWithinSla still looks fine. Short steps can pass rates above drain while the queue grows.
- Record **`stepDurationMs`** and **`backlogTrend`** on every arm.
- After the last pass and first fail, **binary-search** until `(firstFail − lastPass) / lastPass` ≤ **1%** (both systems — same resolution).
- Report **`rampResolutionRel` / `rampResolutionNote`** in the evidence (e.g. `±1%`).
- Neither side’s number may be fuzzier than the other’s.
- **Invariant:** `rateSustainableWithinOneSecondSla` ≤ `durableRecordsPerSec` (within measurement noise). If not, the ramp is still too short.

### 4. Same conditions + alternating systems

| Constraint  | Rule                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| Agent count | Same `agentsAtLimit` (or agreed shared N) for both                           |
| Disk        | Same volume the **serial** fsync ceiling was measured on                     |
| Host        | Otherwise idle                                                               |
| Order       | **Alternate** across reps: ClawQL₁ → Ontologiql₁ → … → ClawQL₃ → Ontologiql₃ |

### 5. Merge only after both sides

```bash
CLAWQL_DENSITY_PEER_JSON=/path/to/ontologiql-five-arms.json \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

`reading.sharedHostComplete=true` only when: peer present, **serial** fsync ceiling attached, both headlines declare a **3-rep floor**, and both report ramp resolution. No win copy until then.

## Five numbers (side by side)

| #   | Number               | Definition                                                                                                                                                           |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **agentsAtLimit**    | First resource exhausted under the shared RSS ceiling. Retained at limit = wake-deadline schedule.                                                                   |
| 2   | **wakeWarmMs p99**   | Cached / warm wake.                                                                                                                                                  |
| 3   | **wakeColdMs**       | Cold wake — median + range until orders locked.                                                                                                                      |
| 4   | **deadlineAccuracy** | Shared 1s SLA; identical fired definition + flush policy; schedule format; **refined** ramp (3-rep floor + resolution); scaled bursts; crash test; deadline restart. |
| 5   | **restartSurvival**  | Parked bags survive process restart.                                                                                                                                 |

## Five deadline arms (shared-host run)

1. Steady showcase
2. Scaled bursts (first miss; N ≤ agentsAtLimit) — **3 reps → floor**
3. Sustained-rate ramp — coarse ladder + **binary refine** + **3-rep floor** + resolution
4. Flush crash test
5. Deadline restart (rebuild + overdue catch-up; disclose schedule format)

## Methodology status

| Gate                 | ClawQL                                                                                 | Ontologiql                                                                           |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Flush + crash test   | group_commit 64/10ms; pass; async-fsync double-buffer active                           | group_commit 64/10ms; pass (#144). Prior os_buffer ~400k/s superseded                |
| Scaled bursts        | first miss **250k** @ 2.5e6                                                            | first miss **200k** @ 200k (N ≤ agentsAtLimit)                                       |
| Ramp                 | 256k pass / 384k fail (3-rep floor); refine ±1% on this host                           | **196k / 198k ±0.5%** (refined)                                                      |
| Serial fsync ceiling | ~7.9k/s (~126 µs); see `fsync-ceiling.json`                                            | **~8.9k/s (~112 µs)** board-matched; overwrite ~50k retracted                        |
| flushStats / latency | avgBatch 64; fsyncs ~3.5k; under-load p50≈probe; **metadata arms ~+3% (neutral here)** | avgBatch ~64; fsyncs ~2.2k ≈24% serial; producer fast; **dbuf candidate unverified** |
| fdatasync+prealloc   | Measured — does not close gap on this host                                             | Should run the same arms before assuming idle-writer                                 |
| Deadline restart     | ~40–55 ms @ 2.5e6; format disclosed                                                    | **~2–3 ms** after compact-array (was ~80 ms) — rebuild gap closed                    |
| Shared host          | **pending** — dedicated host + write-cache recorded                                    | **pending**                                                                          |

## Reading gaps (not win copy)

### Serial ceiling — not the old parallel/overwrite number

Do not treat ClawQL 256k vs Ontologiql 192k as “disk-shaped” until both fractions of the **same serial** ceiling are known on one host. If serial ≈ 4k fsync/s, theo max ≈ 256k and the board is at the real ceiling. If serial is still much higher, profile drain CPU on both sides.

### RebuildMs

Compact-array on Ontologiql (~2–3 ms) closes the prior format gap vs ClawQL ~40–55 ms @ 2.5e6. Still disclose `scheduleFormat` on both rows.

## Lab mirror (Ontologiql — different host; not a public deadline claim)

| Field                             | Value                                           |
| --------------------------------- | ----------------------------------------------- |
| agentsAtLimit (context)           | 200,000                                         |
| flushPolicy                       | group_commit batchMax=64 flushIntervalMs=10     |
| crashTest.ok                      | true                                            |
| sustainablePerSec (refined)       | **196,000** (±0.5%)                             |
| firstRateMissingSlaPerSec         | **198,000**                                     |
| rampWentPastFailure               | true                                            |
| firstBurstSizeMissingOneSecondSla | 200,000                                         |
| rebuildFromDiskMs                 | **2–3** (compact-array)                         |
| serialFsyncsPerSec                | **~8,900** (board-matched; overwrite retracted) |
| flushStats                        | avgBatch ~64; fsyncs ~2.2k ≈24% serial          |
| noLoss / noDuplicate              | true                                            |
| overdue prompt                    | 1.0                                             |

## Peer artifact (Ontologiql → merge)

Emit JSON matching ClawQL’s `clawql` object, including:

- `headline` with `rule: "three_rep_floor"` and `reps ≥ 3`
- `arms.ramp.rampResolutionRel` / `rampResolutionNote`
- `scheduleFormat`
- Prefer attaching the same host’s `fsync-ceiling.json` serial row (or re-run the probe)

```bash
npm run benchmark:program-density-fsync-ceiling
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
# Alternate Ontologiql each rep (same serial ceiling, refined ramp), then merge peer JSON.
```

Next: interleaved 3-rep campaign on the **dedicated** host with write-cache recorded → peer merge. Publish **durableRecordsPerSec** and **rateSustainableWithinOneSecondSla** for both; disclose each side’s best journal config. No win copy until `sharedHostComplete=true`.
