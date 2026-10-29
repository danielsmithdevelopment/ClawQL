# Durable-agent density — cross-system comparison

**Status:** **Paused (ClawQL side done on this host).** Sustained equals drain within measurement error (~312k/s). ClawQL-only density/deadline numbers are **publishable as single-host lab** (mark “cross-system comparison pending”; parked-state caveat) — see [publish-readiness](../../gtm/publish-readiness.md). Ontologiql numbers stay private. Shared-host deadline campaign can wait; time-sensitive next work is the **Infinity comparison on the Pi**.

Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json) · PR [#1433](https://github.com/danielsmithdevelopment/ClawQL/pull/1433).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Converged characterization (different hosts)

| System                              | Sustained   | Drain       | Ratio                | Bound                          |
| ----------------------------------- | ----------- | ----------- | -------------------- | ------------------------------ |
| **ClawQL** (3-rep same campaign)    | **~312k**/s | **~312k**/s | **1.01** (0.87–1.19) | **writer** — done on this host |
| **Ontologiql** (20k, 30s, conc 256) | **185k**/s  | **320k**/s  | **~0.58**            | **scheduler** (post ack+dbuf)  |

Ack costs now match (~2.2–2.5 µs). If Ontologiql applies pop-all-due + ≤1ms coalesce + no idle-sleep while writers busy, sustained should meet drain (~310–320k each) pending shared-host.

## ClawQL — closed numbers

|                                   | Mean    | Min–Max   |
| --------------------------------- | ------- | --------- |
| durableRecordsPerSec              | ~312k/s | 278–333k  |
| rateSustainableWithinOneSecondSla | ~312k/s | 280–336k  |
| drain / sustained                 | 1.01    | 0.87–1.19 |

Diagnosis: `sustained_equals_drain_within_measurement_error`. Path: short-ramp 636k retracted → scheduler-bound ~140k → coalesce/pop-all-due → writer-bound. Sync p50/p99 ~129/**679** µs · ack ~2.5 µs.

## Ontologiql — next (their repo)

Loose ends closed on ack + double-buffer (drain 156→320k; ack ~2.2 µs; conc 256 best, 512 hurt; hit ~35%). Remaining gap is the **scheduler signature** ClawQL fixed:

1. Pop everything due on each wake
2. Coalesce timer wakes (~1ms)
3. Don't sleep while writers are busy

## Pause / next focus

- **This board:** pause. Shared-host deadline campaign when convenient.
- **Time-sensitive:** Infinity comparison on the Pi while people are still talking about it.
- No win copy until shared-host (or Pi Infinity) evidence.

## HOLD — swap + live-heap before any further density climb

Open from the density thread: a ClawQL resident reading on the order of **~8 GB @ ~102,500 agents** does **not** fit under the **512 MiB** fair-board cap at that slope (~80 KiB/agent). Before this board runs further climb / publish arms, check swap and live heap — RSS alone can hide page-cache, allocator headroom, or swap-backed anon.

**Checked on this cloud-agent host (Thursday, Oct 29, 2026, America/Los_Angeles):**

| Check                                   | Result                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Swap**                                | **None configured** (`Swap: 0B`; `/proc/swaps` empty). RSS pressure cannot spill to disk — OOM/kill risk instead of silent swap bloat.                                                                                                                                                                                 |
| **Live heap (published fair evidence)** | [`evidence-fair.json`](./evidence-fair.json) `clawqlRun`: at limit (past 2.5e6 schedule) `heapUsedKiB` **381210** (~372 MiB) vs `rssKiB` **550664** (~538 MiB) → heap/RSS ≈ **0.69**. After-GC slope `heapUsedKiBPerAgentAfterGc` **0.1504** vs total-RSS `residentKiBPerAgent` **0.2065**.                            |
| **Current fair slope vs 512 MiB**       | At **0.2065 KiB/agent**, ~2.5e6 agents fit near the cap (matches measured limit). At an **~80 KiB/agent** slope, **102,500 agents ≈ 8 GiB** and max under 512 MiB is only ~6.5k agents — that slope is **not** the typed-array deadline-schedule arm in evidence-fair; identify which arm produced it before climbing. |
| **Balloon**                             | Hypervisor balloon present (`balloon_inflate − balloon_deflate`); `free` under-reports usable RAM — do not use `MemAvailable` alone to clear a density gate.                                                                                                                                                           |

**Gate:** do not resume density climb or publish a new resident row until (1) the ~8 GB @ ~102.5k arm is identified (config + commit), (2) that arm reports `heapUsed` after GC alongside RSS, and (3) swap remains absent or is explicitly measured if enabled. Current paused writer-bound numbers stay valid as single-host lab; this HOLD is about not extending them.
