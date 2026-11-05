# TTL3s 2/100 — three pre-latency checks

Cheaper than forced-latency. Done on the original failing board data.

| # | Check | Result |
| - | ----- | ------ |
| 1 | R2 settle trials 1 & 5 | **Loss real** (at least i=1): meta durable, midflight pause markers absent; ok neighbor has `paused_for_kill` |
| 2 | Host / BOOTTIME−MONOTONIC | **Cloud Agent VM**; no board-local drift telemetry; pause candidate **open** (fits resumeMs=62920); run **still counts** |
| 3 | Classifier audit | **Bug found & fixed**: status timeout/fetchError was counted as `lost_midflight_intent` |

Mechanism stays **open**. Pause-aware `CLOCK_BOOTTIME` for lease deadlines is now a concrete product candidate (TLA weak pause tooth added). Forced-latency arms still useful after these.

## 1. R2 settle (trials 1 & 5)

**Prefix:** `s3://clawql-streams-state/tier-c-wedge100-lab-20261104021638`  
**Cell:** `ProgramCellDO:8b3f8c259c1b2bf1aed4a4270920817997c5d8f760e4dc8e59f3f428e2c89b4f`  
**Method:** read-only LTX page scan for `programId:meta` bodies (same spirit as [`during-call-404-r2-settle.md`](./during-call-404-r2-settle.md); no live DO).

| Trial | programId | Meta | Midflight pause durable? |
| ----- | --------- | ---- | ------------------------ |
| **1** (lost) | `phased_after_intent_before_call_1_1793758650321` | yes (epoch 2+) | **No** — never `paused_for_kill` in meta body; ends `completed` |
| **5** (lost) | `phased_after_intent_before_call_5_1793758728011` | yes | **Not confirmed** — no clean pause meta like the control |
| **9** (ok control) | `phased_after_intent_before_call_9_1793758918129` | yes | **Yes** — `status":"paused_for_kill"` in e9 `:meta` |

**Split:** not “intents missing from R2 because we looked at the wrong place / late landing of empty programs.” Programs exist. Trial 1 never journaled the midflight pause shape the harness requires. That is a real durability miss (or never-written pause), not a measurement-only ghost.

Evidence: [`ttl3s-r2-settle-trials-1-5.json`](./ttl3s-r2-settle-trials-1-5.json).

## 2. Host / suspend (BOOTTIME − MONOTONIC)

| Fact | Detail |
| ---- | ------ |
| Host | Cursor **Cloud Agent** `bc-01a180e1-e75b-78be-89f2-1c9728212725` (repo env; suspending hypervisor class) |
| Board suspend telemetry | **None** — soak-style `boottimeSec` / `growthSec` was **not** recorded on this wedge board |
| Regime fit | Trial 5 `resumeMs=62920`; avail 5/100; ambiguous renewals in residual logs — suspend-shaped |
| Product clock | `asyncrt::mono_ms` = `Instant::elapsed` (**CLOCK_MONOTONIC**, stops during suspend); storage/peers use **wall** `expires_ms` |
| Void rule | Soak void (growth >2s) does **not** cover this board. **Do not void after the fact.** Report as a real fail; pause is a candidate mechanism |

TLA: `WeakHolderClockPaused` — wall advances, holder mono frozen → belief > storage → SurvivorTakeover drops intent. Target PASS; weak CE. Product fix candidate: lease deadlines on **CLOCK_BOOTTIME** (pending pause-aware clock work).

## 3. Classifier + stdout provenance

### How `lost_midflight_intent` was decided

`run-board.mjs` mid-flight check: GET survivor `/program/status`; require `meta` and (`intents.length > 0` OR `pauseKind` ∈ {`during_call`,`after_intent_before_call`}).

**Bug (fixed):** `fetchJson` timeout/error returns `{ ok:false, fetchError:true, body:{error} }` → `meta=null` → `present=false` → classified **`lost_midflight_intent`**. Under pressure that is **unknown**, not lost.

**Fix:** only emit `lost_midflight_intent` when status is **readable** (`ok && body.ok && !fetchError`) and midflight markers absent. Otherwise `midflight_storage_unknown` (availability).

R2 settle (§1) still shows trial 1 lacked durable pause markers — so the 2/100 is **not** explained away as classifier-only. The fix stops future false losses.

### Failed JSON reconstruction

[`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json) is `status=measured_stdout_only`:

1. Authentic TTL=3000 board wrote `phased-n100-wedge-lab-enriched.json` (included `trialFailures` with programIds).
2. TTL=10s remasure **overwrote** that path.
3. Gates-only reconstruction from transcript stdout (L380356): correctness items `{i, phase, failureReason}` only — **no** `midFlightStorage` / programIds in the committed fail file.
4. ProgramIds recovered later via R2 prefix discovery (§1).

## Next

1. Pause-aware lease clock (BOOTTIME) — product fix candidate from §2  
2. Forced-latency arms A (Ambiguous timeout) + B (late Applied) still on the table  
3. Remeasure boards must use a **TTL-stamped evidence path** so overwrite cannot destroy `trialFailures` again
