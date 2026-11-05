# TTL3s 2/100 — three pre-latency checks (+ trial-1 injection-miss reading)

Cheaper than forced-latency. Done on the original failing board data.

| # | Check | Result |
| - | ----- | ------ |
| 1 | R2 settle trials 1 & 5 | **Trial 1 = injection miss** (completed, never durable `paused_for_kill`); **trial 5 unsettled** (incomplete, no pause) |
| 2 | Host / BOOTTIME−MONOTONIC | **Cloud Agent VM**; no board-local drift telemetry; pause candidate **open** for trial 5 shape; run **still counts**. BOOTTIME lease deadlines shipped as **hardening**, not as the 2/100 fix |
| 3 | Classifier audit | **Bug found & fixed**: status timeout/fetchError → `midflight_storage_unknown`; plus new **`injection_missed`** outcome |

Mechanism for the published 2/100 stays **open at the headline** (do not rewrite the fail file). Side-by-side reclassify below. Forced-latency arms still useful after these.

## 1. R2 settle (trials 1 & 5) — injection-miss reading

**Prefix:** `s3://clawql-streams-state/tier-c-wedge100-lab-20261104021638`  
**Cell:** `ProgramCellDO:8b3f8c259c1b2bf1aed4a4270920817997c5d8f760e4dc8e59f3f428e2c89b4f`

| Trial | programId | Meta | Midflight pause durable? | Reading |
| ----- | --------- | ---- | ------------------------ | ------- |
| **1** | `…_1_1793758650321` | `completed` | **No** — never `paused_for_kill` | **Injection miss** — program ran to completion; harness then looked for mid-flight intent that never had reason to exist |
| **5** | `…_5_1793758728011` | incomplete / `running` | **Not confirmed** | **Unsettled** — not `injection_missed` (did not complete); not proven loss |
| **9** (ok control) | `…_9_1793758918129` | yes | **Yes** — `paused_for_kill` in e9 `:meta` | Injection hit |

### Effect ledger / twin digest (trial 1)

| Source | Result |
| ------ | ------ |
| Pets mock `owner_${idempotencyKey}` | **Unavailable** after board (ephemeral `__writes`) |
| Twin digest | **Unavailable** — TTL=10s remasure overwrote evidence |
| Journal surrogate | entries **0/1/2** present; entry:2 has `owners.create` + ok; meta `completed` |

Settle rule applied: one write effect (journal) + normal completion without durable pause ⇒ **not a correctness loss**; classify **`injection_missed`**. Pets/twin absence is why this is a journal-surrogate settle, not a pets-ledger settle.

Evidence: [`ttl3s-r2-settle-trials-1-5.json`](./ttl3s-r2-settle-trials-1-5.json) · [`ttl3s-full-board-reclassify.json`](./ttl3s-full-board-reclassify.json).

## 1b. Full-board side-by-side reclassify (all 100)

Definitional correction (same spirit as the readable-gate classifier fix): applied to **every** trial, old and new labels reported together. Published fail file is **not** rewritten.

| Label set | Correctness-shaped count | Notes |
| --------- | ------------------------ | ----- |
| **Old** (stdout gates) | **2** × `lost_midflight_intent` (i=1, i=5) | As published |
| **New** | **0** confirmed lost; **1** × `injection_missed` (i=1); **1** × `incomplete_no_pause` (i=5 unsettled) | R2-sampled after_intent rows refined to `midflight_pause_durable` / etc.; unsampled passes stay `pass` |

Relabeling only the two failures would not be legitimate; the JSON carries all 100 rows.

## 2. Host / suspend (BOOTTIME − MONOTONIC)

| Fact | Detail |
| ---- | ------ |
| Host | Cursor **Cloud Agent** (repo env; suspending hypervisor class) |
| Board suspend telemetry | **None** on this wedge board |
| Trial 1 | Completed normally — a paused clock does **not** explain it |
| Trial 5 | Unconfirmed; resumeMs≈62s remains suspend-shaped **candidate** |
| Product | `asyncrt::mono_ms` now prefers **CLOCK_BOOTTIME** on Linux (lease `last_ok` keeps advancing through suspend); peers already expire on wall `expires_ms` |

**Ship as hardening**, justified by the `WeakHolderClockPaused` TLA tooth. **Do not claim** BOOTTIME fixed the published 2/100.

## 3. Classifier + stdout provenance + evidence overwrite

### `lost_midflight_intent` / `injection_missed`

- Readable-gate fix (prior): timeout/fetchError → `midflight_storage_unknown` (availability), not lost.
- New: if `/program/run` returns **`completed`** instead of `paused_for_kill`, classify **`injection_missed`** (`failureClass: injection`) — counted in `gates.injection`, neither a durability pass nor a loss.
- Mid-flight markers absent after a **completed single-write** resume are not treated as lost.

### Evidence overwrite (fixed)

[`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json) is `status=measured_stdout_only` because TTL=10s remasure overwrote the TTL=3s `trialFailures`.

Harness now:

1. Defaults `FLEET_PHASED_OUT` to a **TTL+UTC-stamped unique path** when unset.
2. **Refuses** to overwrite an existing evidence file unless `FLEET_PHASED_ALLOW_OVERWRITE=1`.

## Next

1. Forced-latency arms A (Ambiguous timeout) + B (late Applied) — still on the table  
2. Remeasure with unique evidence paths (overwrite guard is live)  
3. Treat published 2/100 as **side-by-side reclassified** (1 injection miss + 1 unsettled), mechanism for any remaining loss still open
