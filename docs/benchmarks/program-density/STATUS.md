# Durable-agent density — cross-system comparison

**Status:** **Paused (ClawQL side done on this host).** Sustained equals drain within measurement error (~312k/s). ClawQL-only density/deadline numbers are **publishable as single-host lab** (mark “cross-system comparison pending”; parked-state caveat) — see [publish-readiness](../../gtm/publish-readiness.md). Peer-system density numbers stay private while that project is in stealth. Shared-host deadline campaign can wait; time-sensitive next work is the **Infinity comparison on the Pi**.

Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json) · PR [#1433](https://github.com/danielsmithdevelopment/ClawQL/pull/1433).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)) · [Infinity density + Nitro composition](../../gtm/infinity-density-nitro-composition.md).

### Infinity comparison honesty (2026-11-10)

Board figures: Infinity **77,500** · ClawQL **100,000** under the 2× latency gate → about **29% more**, not 33%. ClawQL arm = matched-shape history appends (history-storage memory), **not** full-stack density. No “denser than” until Laddad team review. Next substantive board: **density with durability on** (journal/leases/output gate, OOM kill, recovery storm at ~100k) — freeze criteria first; invite Infinity’s durable config onto the same host.

## Public claim (ClawQL single-host lab)

> On one node, ClawQL sustained about **312k durable records/s**, matching drain within measurement error (writer-bound). Parked-state density and wake numbers for other systems are not published here while peer comparisons remain private / pending shared-host.

## Converged characterization (different hosts)

| System | Sustained | Drain | Ratio | Bound |
| --- | --- | --- | --- | --- |
| **ClawQL** (3-rep same campaign) | **~312k**/s | **~312k**/s | **1.01** (0.87–1.19) | **writer** — done on this host |
| Peer arm (stealth — private) | — | — | — | Not published on this page |

Ack costs for ClawQL are ~2.2–2.5 µs. Shared-host peer rows stay off the public claim until stealth lifts or Infinity shared-host lands.

## ClawQL — closed numbers

| | Mean | Min–Max |
| --- | --- | --- |
| durableRecordsPerSec | ~312k/s | 278–333k |
| rateSustainableWithinOneSecondSla | ~312k/s | 280–336k |
| drain / sustained | 1.01 | 0.87–1.19 |

Diagnosis: `sustained_equals_drain_within_measurement_error`. Path: short-ramp 636k retracted → scheduler-bound ~140k → coalesce/pop-all-due → writer-bound. Sync p50/p99 ~129/**679** µs · ack ~2.5 µs.

## Pause / next focus

- **This board:** pause. Shared-host deadline campaign when convenient.
- **Time-sensitive:** Infinity comparison on the Pi while people are still talking about it.
- No win copy until shared-host (or Pi Infinity) evidence.
- Do not name stealth peer projects on marketing pages or STATUS blurbs that surface publicly.

## HOLD — swap + live-heap before any further density climb

Open from the density thread: a ClawQL resident reading on the order of **~8 GB @ ~102,500 agents** does **not** fit under the **512 MiB** fair-board cap at that slope (~80 KiB/agent). Before this board runs further climb / publish arms, check swap and live heap — RSS alone can hide page-cache, allocator headroom, or swap-backed anon.

**Checked on this cloud-agent host (Thursday, Oct 29, 2026, America/Los_Angeles):**

| Check | Result |
| --- | --- |
| **Swap** | **None configured** (`Swap: 0B`; `/proc/swaps` empty). RSS pressure cannot spill to disk — OOM/kill risk instead of silent swap bloat. |
| **Live heap (published fair evidence)** | [`evidence-fair.json`](./evidence-fair.json) `clawqlRun`: at limit (past 2.5e6 schedule) `heapUsedKiB` **381210** (~372 MiB) vs `rssKiB` **550664** (~538 MiB) → heap/RSS ≈ **0.69**. After-GC slope `heapUsedKiBPerAgentAfterGc` **0.1504** vs total-RSS `residentKiBPerAgent` **0.2065**. |
| **Current fair slope vs 512 MiB** | At **0.2065 KiB/agent**, ~2.5e6 agents fit near the cap (matches measured limit). At an **~80 KiB/agent** slope, **102,500 agents ≈ 8 GiB** and max under 512 MiB is only ~6.5k agents — that slope is **not** the typed-array deadline-schedule arm in evidence-fair; identify which arm produced it before climbing. |
| **Balloon** | Hypervisor balloon present (`balloon_inflate − balloon_deflate`); `free` under-reports usable RAM — do not use `MemAvailable` alone to clear a density gate. |

**Gate:** do not resume density climb or publish a new resident row until (1) the ~8 GB @ ~102.5k arm is identified (config + commit), (2) that arm reports `heapUsed` after GC alongside RSS, and (3) swap remains absent or is explicitly measured if enabled. Current paused writer-bound numbers stay valid as single-host lab; this HOLD is about not extending them.
