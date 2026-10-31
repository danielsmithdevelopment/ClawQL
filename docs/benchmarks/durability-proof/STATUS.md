# Durability proof ladder — STATUS

**Goal:** Earn a defensible claim that **journaled programs survive SIGKILL without repeating writes**, plus the twin claim that **approved writes are at most once** under crash races — without claiming ClawQL is a durable execution engine ([Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)).

**Live marketing:** [clawql.com/benchmarks#durability](https://clawql.com/benchmarks#durability) publishes the measured Tier C claim, per-phase table, three columns, and ladder. Chip elsewhere: **Lab Yes · fleet Yes (R2 peer kill)**. Still not a durable execution engine. Peer boards vs Pi Durable / Golem wait on maintainer invite.

**Publish copy:** ready-now wording, hold-backs, and never-claims — [publish-readiness](../../gtm/publish-readiness.md). Path to a named step-level durable-execution claim — [durable-execution-claim-path](../../gtm/durable-execution-claim-path.md).

**Claim-path (not a publishable “durable execution” row yet):** ProgramCellDO resume hard-stops on journal/plan digest mismatch (`journal_divergence`). Fleet `statePreserved` is **exact digest equality** vs a per-trial no-crash twin (same plan args); evidence files carry `trialAccounting` so outer-only denominators are explicit (mid-flight `outcome_unknown` is expected, not filtered). Prior n=40 structural + 8 await: [`phased-await-state-n40.json`](../program-cell-fleet-kill/phased-await-state-n40.json). n=100 columns: [`phased-claim-path-columns-n100.json`](../program-cell-fleet-kill/phased-claim-path-columns-n100.json). Plan `sleep` / `await_approval` / `model_call` journaled; reads completed→replay, interrupted→re-request once; model calls: at most one repeated request per crash, never a repeated write. ProgramResume TLA+ in tree. Thursday, Oct 29, 2026 lab N≈1000 (write-kill + await arms) pending clean evidence against the **pass criteria fixed below before results**.

### N≈1000 claim-path pass criteria (fixed before results — Thursday, Oct 29, 2026)

Lab shape: `FLEET_PHASED_N=750` write-kill + `FLEET_PHASED_AWAIT_TRIALS=250` (overall 1000). Evidence target: [`phased-n1000-claim-path.json`](../program-cell-fleet-kill/phased-n1000-claim-path.json). **These bars are committed before the run lands; do not loosen them to fit the data.**

| Gate                   | Pass iff                                                                                                                                                                                         | Denominator / note                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Duplicates**         | `columns.duplicates.total === 0`                                                                                                                                                                 | All write-kill trials                                                                  |
| **Journal divergence** | `columns.stepsRepeated.journalDivergence === 0`                                                                                                                                                  | All write-kill trials                                                                  |
| **Write steps rerun**  | `columns.stepsRepeated.writeStepsRerun === 0`                                                                                                                                                    | Pets-ledger duplicates; target 0                                                       |
| **Resume deadline**    | `columns.availability.resumeDeadlineMisses === 0`                                                                                                                                                | All write-kill (+ await) resumes within budget                                         |
| **Completed (outer)**  | `columns.completed.rateOuterPhases === 1`                                                                                                                                                        | Only `before_intent` + `after_call_before_journal`; every outer trial `completedClean` |
| **State preserved**    | `columns.statePreserved.rate === 1` and `compareMode === "digest_equality"`                                                                                                                      | Eligible = outer + `completedClean` + twin captured; exact step/result digests         |
| **Wait approval**      | `columns.waitApproval.okRate === 1`                                                                                                                                                              | Separate arm; every await trial survives peer kill and completes after approve         |
| **Mid-flight honesty** | Mid-flight phases (`after_intent_before_call`, `during_call`) end `outcome_unknown` as expected; **not** required to `completedClean`; must appear in `trialAccounting` with `filteredOut === 0` | Expected unknown ≠ failure                                                             |
| **Board ok**           | Evidence `ok === true` (zero dups, zero deadline misses, every phase expectation met)                                                                                                            | Includes mid-flight unknown expectations                                               |

**Fail (do not claim):** any duplicate write, any `journal_divergence`, any outer trial not cleanly completed, any eligible outer twin digest mismatch, any await trial that fails survive+complete, any resume deadline miss, or any change to these criteria after seeing results.

**Claim authorized only if clean:** step-level checkpointed durable execution, with stated limits (interrupted read/model re-request once; mid-flight writes → person; **not** mid-step unmodified agents). See [durable-execution-claim-path](../../gtm/durable-execution-claim-path.md).

### N≈1000 lab — fail report (final; frozen v1 criteria unchanged)

Evidence: [`phased-n1000-claim-path.json`](../program-cell-fleet-kill/phased-n1000-claim-path.json) (`status=measured`, `ok=false`, measuredAt 2026-10-30T20:30:18.943Z). Lab shape 750 write-kill + 250 await. **Frozen v1 criteria above were not loosened.**

| Gate               | Result                                | Cause                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicates         | **PASS** 0                            | `zeroDuplicates=true`; rule-of-three upper 95% = 0.4%                                                                                                                                                                                        |
| Journal divergence | **PASS** 0                            | —                                                                                                                                                                                                                                            |
| Write steps rerun  | **PASS** 0                            | —                                                                                                                                                                                                                                            |
| Resume deadline    | **FAIL** 7 / 750 (0.93%)              | Wall-clock misses after survivor `SELF-FENCE` (4 fences, 0.53%) / rebuild inside resume clock. Long tails stay visible: trial **132** ≈904s; trial **325** ≈2720s (p999). Aligns with stock **0.9%** deadline / **0.6%** fence — not a fluke |
| Completed (outer)  | **FAIL** 369 / 373 (98.9%)            | 4 outer incompletes — availability/harness (deadline / pause), not wrong program outcomes. Mid-flight unknown remains expected                                                                                                               |
| State preserved    | **FAIL** 368 / 369                    | **`twin_capture_failed` ×1**, not digest mismatch (`compareMode=digest_equality`). Twin shares the fleet; fences can kill the capture                                                                                                        |
| Wait approval      | **FAIL** 70 ok / 180 failed / 250 ran | **Arm finished** (not “70 of 250 run”). See breakdown below.                                                                                                                                                                                 |
| Mid-flight honesty | mostly                                | Some mid-flight trials miss expected `outcome_unknown` when resume deadline misses first                                                                                                                                                     |
| Board ok           | **FAIL**                              | Zero-deadline + outer-complete + state + await gates not all met                                                                                                                                                                             |

#### Wait approval 70/250 — what the 180 failures were

`okRate=0.28` is **not** an incomplete arm and **not** mostly correctness. The await loop ran all **250** trials (`status=measured`, `awaitTrialsCompleted=250`). Log output stopped at `await 74/250` then printed `done` because the **park-fail path** pushed `ok=false` and `continue`d **without `console.log`** — trials 75–250 left no log lines.

| Class                                      | Count   | Notes                                                                                                 |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| **ok**                                     | **70**  | Survived peer kill + completed after approve                                                          |
| **Availability — `await_park_failed`**     | **178** | `/program/run` never parked (`fetch failed` / node down). Includes silent trials 27–28 and **75–250** |
| **Availability — not survived / deadline** | **2**   | Logged: await 26 (`resumeMs≈909s`), await 74                                                          |
| **Correctness (dup / wrong write)**        | **0**   | No `writeCount>1` in the retained sample                                                              |

Evidence field: `awaitArmForensics` on [`phased-n1000-claim-path.json`](../program-cell-fleet-kill/phased-n1000-claim-path.json).

**Harness bugs (fixed before v2 await; criteria unchanged):** (1) park-fail lacked `failureClass` — under v2 scoring those 178 would have been **invisible** to the availability gate; (2) no log line; (3) no fleet rebuild, so one dead node burned the rest of the arm; (4) evidence kept only the first 50 await trials, hiding the park-fail tail. Fix in `run-board.mjs`: classify + log + `rebuildFleet` on park fail; keep all await failures + `failureByReason`. **v2 board restarted** so the running process loads the fixed harness (write-kill progress discarded; same frozen v2 criteria, fresh R2 prefix).

**Kept published** as the failed zero-deadline board next to v2. **Chosen path (locked Friday, Oct 30, 2026 before the next run):** option 2 — split correctness vs availability (see below). Celld fixes proceed in parallel; a later re-measure can show deadline-miss rate falling from X% to Y%.

### N≈1000 claim-path pass criteria v2 — correctness / availability split (fixed before re-run — Friday, Oct 30, 2026)

**Why the criteria changed (stated before the new run):** The v1 board required zero resume deadline misses. That mixes **wrong outcomes** (correctness) with **no outcome in time** (availability). The published Tier C claim already discloses availability as a rate (0.6% self-fence / 0.9% deadline miss). v2 matches that structure. **v1 evidence stays published** at [`phased-n1000-claim-path.json`](../program-cell-fleet-kill/phased-n1000-claim-path.json) as a failed zero-deadline board; v2 evidence target: [`phased-n1000-correctness-availability.json`](../program-cell-fleet-kill/phased-n1000-correctness-availability.json). Harness: `FLEET_PHASED_SCORE_MODE=correctness_availability_v2`.

**Frozen constants (written before the run — do not change after start):**

| Constant                       | Value                                                             | Meaning                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Lab shape**                  | `FLEET_PHASED_N=750` write-kill + `FLEET_PHASED_AWAIT_TRIALS=250` | Overall **1000** trials                                                                                                                                                                                                                                                                                                                                |
| **Wall-clock resume deadline** | **`FLEET_PHASED_RESUME_DEADLINE_MS=60000` (60 000 ms)**           | “In time” = outcome (or classified mid-flight unknown) within **60 s wall clock**, **including** orchestrator recovery / rebuild. Same value for write-kill and await arms                                                                                                                                                                             |
| **Availability rate ceiling**  | **0.02 (2%)**                                                     | Pass iff availability failures / denominator ≤ 0.02                                                                                                                                                                                                                                                                                                    |
| **Availability denominator**   | **All 1000 trials** = 750 write-kill + 250 await                  | `gates.availability.denominator === overallN === 1000`. Every await trial is one unit in the denominator. Numerator = availability-class failures from **either** arm (deadline miss, pause fail, twin_capture_failed, await not survive/complete). Mid-flight `outcome_unknown` that completes within the deadline is **not** an availability failure |

**Definitions (outcome, not column):**

| Class                    | Meaning                                         | Counts as                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Correctness failure**  | A **wrong** outcome                             | duplicate write; `journal_divergence`; write-step rerun; **digest mismatch**; **`lost_midflight_intent`** (survivor `/program/status` lacks intent/`pauseKind` after mid-flight kill — harness checks this automatically from v3) |
| **Availability failure** | **No** outcome in **wall-clock** time / capture | resume wall-clock > **60 000 ms** (recovery inclusive); pause failure (`pause failed: …`); **twin_capture_failed**; await arm that does not survive+complete without a wrong write |
| **Outer completion**     | Reported overall                                | Each outer miss is assigned to correctness **or** availability above — not a third zero-gate                                                                                       |

**Pass gates (frozen for v2 — do not loosen after results):**

| Gate                     | Pass iff                                                                                | Note                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Correctness**          | `gates.correctness.failures === 0`                                                      | Zero wrong outcomes across write-kill + await                                                                                                                                                                       |
| **Availability ceiling** | `gates.availability.failureRate ≤ 0.02`                                                 | Denominator = **all 1000** trials (750 write-kill + 250 await). Consistent with published ~1.5%-class disclosure band                                                                                               |
| **Availability tail**    | Evidence reports `resumeMs.p99`/`max`, `recoveryMs.p99`/`max`, and `resumeActiveMs`     | **Reported without a pass/fail ceiling.** Diagnostic split only: wall `resumeMs` = active + recovery. A 904s stall must stay visible and must count as an availability failure when wall time exceeds **60 000 ms** |
| **Outer completion**     | Reported with per-miss class                                                            | Informational for the claim; misses classified, not required to be 0 if they are availability                                                                                                                       |
| **Wait approval**        | Wrong-write → correctness; no survive/complete within **60 000 ms** wall → availability | Same split; each await trial counts in the 1000-trial denominator                                                                                                                                                   |
| **Board ok**             | Correctness zero **and** availability ≤ 2%                                              | `status=measured` only when both arms finish                                                                                                                                                                        |

**Sampling honesty (not a criteria change):** With a true availability-miss rate near the published ~1.5%, a 1000-trial binomial draw sits above 2% by chance roughly **1 time in 12**. If that happens, it is an **honest fail** like v1 — fix celld / re-measure; do **not** loosen the ceiling or the 60 s deadline after seeing results.

### N≈1000 v2 — finished (honest fail)

Evidence: [`phased-n1000-correctness-availability.json`](../program-cell-fleet-kill/phased-n1000-correctness-availability.json) · measured **2026-10-30 21:40 PDT** (`2026-10-31T04:40:40.919Z`). Prefix `tier-c-phased-20261030212001`.

| Gate | Result | Detail |
| ---- | ------ | ------ |
| **Availability** | **FAIL** | 34/1000 = **3.4%** > frozen ceiling 2%; resumeMs p50≈12.5s / p99≈217.6s / max≈920.8s |
| **Correctness (harness)** | reports 0 | Running process **predated** mid-flight storage check + R2 settle reclassification |
| **Correctness (settle)** | **non-zero** | Five `during_call` trials lost mid-flight journal (below) — do **not** publish corr=0 |
| Duplicates | 0 | Zero-dup measurement stands; mechanism claim remains paused |

**Report as clusters (trials are not independent):** stall-seeded `/health` hangs dominate availability; mid-flight lost-intent is a separate durability defect. Fixing lease-sweep / alive-vs-ready addresses most avail failures; fenced-ack + incarnation fencing (vendored celld) addresses lost intent.

| Underlying incident | Trials | Surface classes |
| ------------------- | ------ | --------------- |
| Stall cluster | 83–84, 132–134, 285–286, 387–390, 441–442 | `resume_deadline_miss` → `pause_failed` / `no_expected_outcome` cascade |
| Twin | 335 | `twin_capture_failed` |
| Lone mid-flight | 494 | `no_expected_outcome` (404) |

**Two fixes — label what each does:**

| Fix                                            | Layer               | What it does                                                                                                          | What it does _not_ do                                                                    |
| ---------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cap `waitNode` wall time / resume `deadlineAt` | **Harness**         | Turns a 15-minute harness wait into a **faster classified failure** (p99 optics)                                      | Does **not** make `/health` answer; availability may improve less than the tail suggests |
| Bounded lease-sweep + alive vs ready           | **celld (product)** | Stops the **node hang** where `/health` accepts TCP but never responds (same pattern as the dead-leader-sweep spiral) | **Shipped in `0.4.0-clawql.3`:** `/.well-known/celld/alive` + timed readiness (`CELLD_HEALTH_TIMEOUT_MS`); maintenance phase hard-budget (`CELLD_MAINTENANCE_PHASE_BUDGET_SECS`). Re-measure on v3 at stock TTL. |

**`during_call` 404 ×5 — R2 settle (read-only on live prefix `tier-c-phased-20261030212001`):**

Evidence: [`during-call-404-r2-settle.json`](../program-cell-fleet-kill/during-call-404-r2-settle.json). Method: live ProgramCellDO `_cf_KV` + 1879 local generation SQLite copies + `GET /program/status` for the one present id. No writes to the prefix.

| Trial | Journal/meta in current-run storage | Intent | Verdict |
| ----- | ----------------------------------- | ------ | ------- |
| **134, 286, 390, 442** | **Missing** — never present in-window (neighbors ±4 present with full journals; e130–e144 never contained 134) | never | **Durability failure** — not “wedged node slow to see them” |
| **494** | Create `meta` **present** (`phased_during_call_494_1793409345554`); live `/status` ok | **never** durable (`intents:[]`, no `pauseKind`) | **Durability failure** for the mid-flight intent contract; create meta alone ≠ journal-before-hang |

Harness still scored these as `failureClass=availability` (`no_expected_outcome` / first-404 terminal; running process predates mid-flight 404 retry). **Do not publish correctness = 0** for this board: four programs’ pretends-journaled state are absent from R2-backed DO storage, and 494 never got a durable write intent. That also fails the state-preserved reading of “journaled mid-flight state survives.” Outside writes still `writeCount=0` / no duplicates — the wrongness is **lost journal**, not a repeated write.

**Next harness (either way):** retry mid-flight 404s until the wall deadline; retain `programId`; later `/status` check. Product path remains lease-sweep + alive-vs-ready so the wedged `/health` stall stops seeding these gaps.

**Mechanism claim impact (beyond this board):** the write protocol’s public fact “intent is journaled before the call” is **not reliably true on celld/R2** under these kills — the call can be in flight while intent is absent from durable storage. Zero duplicates here only because the mock upstream hung. A completing upstream would be a lost-order / possible double-charge on resume (`decideCallResume` → `rerun` when intent+`pauseKind` are both missing). **Publish readiness qualified** ([publish-readiness.md](../../gtm/publish-readiness.md)); Cost Plus / social correction: [cost-plus-thread-correction.md](../../gtm/cost-plus-thread-correction.md).

**Root cause (celld already has an output gate — it failed under kill):** denoland/celld `crates/logic/output_gate.rs` holds `Channel::Fetch` until LTX proves a write position under the resident lease epoch (`CELLD_OUTPUT_GATE` default on; `=0` disables). Settled gaps still happened → either proof/ownership race, stale writer accepted into a discarded generation (bucket “cannot refuse a stale writer”), or local SQLite `synchronous=NORMAL` position ahead of what survivors can restore. **One fix closes both holes:** fenced acknowledgment — every storage write returns a sequence; egress held until durable **under the current lease epoch**; incarnation in lease + every write; R2 conditional reject of stale incarnation; refuse start if a live incarnation already holds the node ID. Spec: [celld-output-gate-epoch-fence.md](../../streams/celld-output-gate-epoch-fence.md). Local `storage.get` after `put` is **not** part of the fix (sanity only).

**Conformance / next board:** TLA+ `IntentDurablyAckedBeforeSend`; trace checker; kill-after-fetch regression (**expected fail** until gate proven — then `CLAWQL_REQUIRE_OUTPUT_GATE=1`). v3: same frozen criteria + automatic mid-flight intent check in the harness, on **`0.4.0-clawql.3` at stock `CELLD_TTL_MS=10000`** (not the 3s wedge board); restore mechanism claim only after correctness passes with that check. Alive-vs-ready + bounded maintenance shipped in clawql.3 (see AVAILABILITY.md).

### celld `0.4.0-clawql.3` — alive vs ready + bounded maintenance

| Surface | Behavior |
| ------- | -------- |
| `GET /.well-known/celld/alive` | Always answers quickly (`alive:true`); ignores WEDGE; does not await actor Health |
| `GET /.well-known/celld/health` | Readiness: `fleet_ready` + timed actor Health (`CELLD_HEALTH_TIMEOUT_MS`, default 1500) → **503** on timeout instead of hanging |
| Maintenance ticker | Abort stuck maintain / dead-leader sweep / bundle GC after `CELLD_MAINTENANCE_PHASE_BUDGET_SECS` (default 180) |
| Helm | Liveness → `alivePath`; readiness → `healthPath` |

Smoke: alive returned 200 in &lt;2ms while a concurrent readiness request was held by `CELLD_WEDGE_HEALTH_FLAG`.

### N=40 forked celld fence board (clawql.1 — weak sample)

Evidence: [`phased-n40-fork-fence.json`](../program-cell-fleet-kill/phased-n40-fork-fence.json) · measured **2026-10-30 22:40 PDT** (`2026-10-31T05:40:45.747Z`) · **`celldBinaryVersion=0.4.0-clawql.1`** / `fenceMode=fenced_clawql1_confirm_get_live_incarnation` (confirm GET + live-incarnation refuse; **before** clawql.2 epoch-at-confirm — do not cite as clawql.2 efficacy).

| Gate | Result | Detail |
| ---- | ------ | ------ |
| Correctness (incl. `lost_midflight_intent`) | **PASS** 0 failures | Mid-flight 20/20 ended `outcome_unknown` as expected; harness saw intent/`pauseKind` on survivor status for every mid-flight kill |
| Availability | **PASS** 0/40 | resumeMs p50≈12.6s / p99≈13.8s (lease-floor) |
| Outer completion / state preserved | **PASS** 20/20 | — |
| Duplicates | **PASS** 0 | rule-of-three upper 95% = 7.5% |

**Vs v2 settle:** v2 had **5** `during_call` durability failures (4 missing journal + 1 create-meta-without-intent). This N=40 sample had **0** `lost_midflight_intent`. That is encouraging on the same kill shape, but **not efficacy proof** — with 0 events in 40 trials the 95% rule-of-three only bounds a loss rate below ~7.5% on the board’s duplicate metric, and a zero-loss claim for mid-flight intent needs the focused wedged `during_call` board (hundreds of kills, hang `/health` then kill) on **clawql.2**. Durable-ack `wait_us` was not collected on this run (`RUST_LOG=timing` unset); resumeMs is lease-dominated, not the ~0.6s gate wait.

### N=100 wedged unfenced negative control (reproduces the bug)

Evidence: [`phased-n100-wedge-during-call-unfenced-control.json`](../program-cell-fleet-kill/phased-n100-wedge-during-call-unfenced-control.json) · clawql.2 with **`CELLD_OUTPUT_GATE=0` + `CELLD_FENCED_ACK=0`** (`fenceMode=unfenced_negative_control`) · same hang-`/health`-then-kill `during_call` board · `RUST_LOG=timing=debug`.

| Metric | Result |
| ------ | ------ |
| Trials | 100/100 measured |
| `lost_midflight_intent` | **100/100 (100%)** — every trial |
| Duplicates | 0 |
| Meaning | This harness **does** trigger the durability hole when the fence is off. A clean fenced board on the same shape is therefore informative (not a no-op test). |



**Claim if v2 clean:** step-level checkpointed durable execution on **correctness** (never a wrong write / digest **and** no lost pretends-journaled mid-flight meta/intent), with **availability disclosed** (fence + deadline + pause/twin-capture rates ≤2% of 1000; resume/recovery p99/max reported, no separate tail ceiling). Still not mid-step unmodified agents. Parallel celld product work (not a v2 gate): lease renew / lease-sweep / alive-vs-ready / **pause-aware clocks** (host pause/suspend — wall time jumps while the machine was not running; distinct from orchestrator recovery). Do **not** freeze the resume deadline during `ensureSurvivor`/rebuild — that would quietly loosen the availability criterion.

## Scoped Tier C claim (measured — stock R2)

> Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.

Every number is measured. Availability costs are stated rather than left for the reader to discover. Scope: two celld nodes, one storage provider (Cloudflare R2). Avoid “durable execution” and “exactly once.”

### N=100 wedged fenced clawql.2 (paired with unfenced control)

Evidence: [`phased-n100-wedge-during-call-fenced.json`](../program-cell-fleet-kill/phased-n100-wedge-during-call-fenced.json) · `0.4.0-clawql.2` · `CELLD_OUTPUT_GATE=1` + `CELLD_FENCED_ACK=1` + `CELLD_FENCED_ACK_CONFIRM_GET=1` · `RUST_LOG=timing=debug` · same hang-`/health`-then-kill `during_call` board as the unfenced control.

| Arm | Fence | `lost_midflight_intent` | Rate |
| --- | ----- | ------------------------ | ---- |
| Unfenced control | GATE=0, FENCED_ACK=0 | **100/100** | **100%** |
| Fenced clawql.2 | GATE=1, FENCED_ACK=1, confirm GET on | **0/100** | **0%** |

Correctness + availability gates **PASS** on the fenced arm (`ok=true`). Zero survivor self-fences / deadline misses on the call-sent remeasure.

**Resume latency (do not compare to stock):** this board set **`CELLD_TTL_MS=3000`** (fast wedge cycles; `wedgeHoldMs=7000` ≈ 2× TTL). Resume p50≈**3.8s** / p99≈4.6s is the lease floor under that TTL. Stock boards use TTL=10000 and see ~12–14s resume p50 — different lease floor, not a gate improvement. Evidence carries `resumeLatencyNote`.

**Call-sent check — settled:** a gate that blocks egress forever can also produce 0 lost intents (availability failure disguised as a durability win). Remeasure with harness `callSent.sawInFlight` (else `call_never_sent`):

| Check | Result |
| ----- | ------ |
| Mock pets `inFlight>0` before SIGKILL | **100/100** |
| `call_never_sent` | **0** |
| `outcome_unknown` + intent/`pauseKind` visible on survivor | **100/100** |
| `lost_midflight_intent` | **0/100** |

Sequence on every trial: durable ack → pets hang in flight → wedge/kill → resume `outcome_unknown` with intent visible. The zero-loss result is **not** “never sent.”

**Durable-ack latency:** append-mode timing logs yielded **300** `durable_wait` samples (p50≈0.72s / p99≈1.06s; diagnostic — multiple events can fire per trial). PUT-only vs PUT+GET A/B still open (`CELLD_FENCED_ACK_CONFIRM_GET`). See [`celld-durable-ack-latency.md`](../../streams/celld-durable-ack-latency.md).

**Efficacy / residual-rate wording:** with a 100% unfenced baseline and proven call-sent on the fenced arm, 0/100 fenced proves the fence closes **this** wedged-fleet lost-intent failure mode without turning it into an availability hole. On its own, N=100 still only bounds a residual loss rate below about **3%** (rule-of-three). Restoring the broader mechanism claim (patched runtime + output gate on) waits on the **v3 board at N=1,000** with the automatic R2 intent check, which tightens that bound toward **~0.3%**.


### Outcome unknown ~48% — read the per-phase table

Aggregate “about half unknown” is a targeting artifact: kills are aimed evenly at four phases; two are the in-flight window. Evidence: [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json) · narrative [`AVAILABILITY.md`](../program-cell-fleet-kill/AVAILABILITY.md).

| Kill phase                        | Outcome unknown        |
| --------------------------------- | ---------------------- |
| Before the approval is consumed   | **0** / 252            |
| After intent recorded             | **240** / 248 (~96.8%) |
| During the call                   | **241** / 251 (~96.0%) |
| After the call, before journaling | **0** / 249            |

In real operation, crashes mostly land outside the brief in-flight window, so unknown outcomes are far rarer than this targeted test shows. Nonzero on either outer phase is a bug, not a number to explain.

### TTL tradeoff rows

| Row                  | Status                                | Evidence                                                                                                                      |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| stock (`TTL=10s`)    | **Measured** N=1000                   | [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json)                                                     |
| TTL-only 30s         | **Measured** n=40 (label sample size) | [`ttl30-evidence.json`](../program-cell-fleet-kill/ttl30-evidence.json) — failover ~32s                                       |
| production_preferred | **Planned** — not a result            | Same N as stock before any claim; renew ⅕ + regional leases — [`TTL-TRADEOFF.md`](../program-cell-fleet-kill/TTL-TRADEOFF.md) |

Prefer renew-every-⅕ + regional leases over TTL stretch. Do not publish preferred as measured.

### Enough to contact John

Send the claim above, the evidence JSON, the per-phase table, the harness, the honest caveats (12-second failover; stock 0.6% self-fence / 0.9% deadline miss), and an invitation to try breaking it. Do not wait for the tuned configuration.

**Engage privately, not in the public thread.** Both sides of the “is Pi magically durable?” fight are right about different meanings — [execution vs effect durability](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate). DM John with: Golem makes execution durable; ClawQL governs remote effects neither runtime claims to make durable alone — at most once, approved, audited; crash numbers; check our setup. Later: own calm post on the two kinds, with data, no dunk. Pitch text: [collaboration pitch](../../gtm/golem-overlap-and-durability-honesty.md#collaboration-pitch-private--not-the-public-thread).

**Also planned (not a gate for outreach):** resume time vs journal length; snapshots if growth is material — [honesty § measure](../../gtm/golem-overlap-and-durability-honesty.md#measure-resume-vs-journal-length-planned--find-it-yourself).

---

## Claim inventory (what we are proving)

| Claim                                                                               | Tier that earns it                      |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| File-journal program: SIGKILL → resume, writes `outcome_unknown` (no re-send)       | **A**                                   |
| ProgramCellDO (celld DO journal): SIGKILL celld → same contract                     | **B**                                   |
| Same as B on multi-node fleet + LTX diagnose + host WORM audit continuity           | **C** (wild “survives a crash”)         |
| Mandate / approved-write: kill mid-consume → zero duplicate side effects (N trials) | **D** (security suite `kill_mid_write`) |

---

## Ladder

| Tier   | Name                                  | Status                                           | Evidence / command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | File-journal SIGKILL stand-in         | **Yes** (CI-gated)                               | [`program-kill-node-standin/evidence.json`](../program-kill-node-standin/evidence.json) · `npm run demo:kill-node-standin` · workflow `program-durability.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **B**  | ProgramCellDO isolate SIGKILL         | **Yes** (CI-gated when streams-celld paths fire) | [`program-cell-isolate-kill/evidence.json`](../program-cell-isolate-kill/evidence.json) · `STREAMS_CELLD_SMOKE_REQUIRED=1 npm run smoke:program-cell-kill -w …` · job on `streams-celld.yml`                                                                                                                                                                                                                                                                                                                                                                                                  |
| **C**  | Fleet LTX + peer kill                 | **Yes** (lab fleet on R2)                        | PoC: [`program-cell-fleet-kill/evidence.json`](../program-cell-fleet-kill/evidence.json). Phased board: [`phased-evidence.json`](../program-cell-fleet-kill/phased-evidence.json). **Three columns** + failover in claim (~resume p50 seconds). TTL tradeoff rows: [`ttl-tradeoff-evidence.json`](../program-cell-fleet-kill/ttl-tradeoff-evidence.json) · [`TTL-TRADEOFF.md`](../program-cell-fleet-kill/TTL-TRADEOFF.md) · [`AVAILABILITY.md`](../program-cell-fleet-kill/AVAILABILITY.md). Prefer renew cadence + regional leases over TTL-only stretch. Not the AWS three-arm cost board. |
| **D**  | Kill-mid-write board (N trials)       | **Yes** (lab harness; CI N=50)                   | [`security-suite/kill-mid-write/`](../security-suite/kill-mid-write/) · `npm run benchmark:kill-mid-write`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **D+** | Comparison board (dual columns)       | **Yes** (ClawQL arms; peers pending invite)      | [`comparison/`](./comparison/) · `npm run benchmark:durability-comparison` — duplicates + `outcome_unknown` × idempotent/non_idempotent                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **E**  | MCP `execute_program` → ProgramCellDO | **Open**                                         | Today `CLAWQL_PROGRAM_CELLD_ISOLATE` is pin/readiness only; Lab HTTP `/program/*` is separate from Core MCP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F**  | Resume vs journal length              | **Planned**                                      | Measure resume wall time at short vs long journals; add periodic snapshots if growth is material ([honesty](../../gtm/golem-overlap-and-durability-honesty.md#measure-resume-vs-journal-length-planned--find-it-yourself)) — not required before John outreach                                                                                                                                                                                                                                                                                                                                |

---

## How do our numbers compare to Golem?

We cannot say yet on a shared board — Golem has not published the kind of crash measurement above. Public Golem figures describe different things:

| What's measured                  | Golem (their claims)           | ClawQL (your measurements)                                                                                                                                                                                         |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starting a unit of work          | 2 ms Agent cold start          | Not yet measured for celld cells                                                                                                                                                                                   |
| Memory per unit                  | 1 MB Min memory per agent      | About 471 KB per celld cell (earlier measurements)                                                                                                                                                                 |
| Density                          | 10,000+ Active agents per node | **Parked fair board `measured` (fair-v2)** — [program-density](../program-density/STATUS.md) (deadline schedule @ **rss** 2.5e6; 1s SLA steady+burst with tick/excess; cold=median+range only; not active-at-50ms) |
| Duplicated writes after a crash  | No published crash test        | **0 in 1,000** phased kills                                                                                                                                                                                        |
| Failover time after a node crash | No published figure            | About **12 seconds** median, set by the lease                                                                                                                                                                      |

**Trade-off (now in his words):** Golem favors completing the work — retry; without upstream keys an interrupted POST can happen twice. ClawQL favors never repeating a consequential action — consume the approval first; cost is an explicit `outcome_unknown` instead of a silent miss or a blind retry. Same unavoidable limit; opposite choices. That does **not** mean “person forever”: when the API supports idempotency keys or lookup-by-reference, the unknown should resolve automatically ([check-then-decide](../../gtm/golem-overlap-and-durability-honesty.md#why-outcome-unknown-and-why-that-does-not-undermine-durability)) — planned, not claimed.

**Where ClawQL is likely ahead:** never repeating a write even against an API that ignores idempotency keys. Confirmed by his “at least once unless keys” framing. “Likely” until both run against the non-idempotent mock on the dual-mode board.

**Where ClawQL is probably behind:** failover speed (~12s lease floor). A mature durable runtime may recover faster — renew more often and keep leases on regional storage.

**Where unmeasured / planned:** celld cold start; **active** agents-per-node (fair parked density is separate — [program-density](../program-density/STATUS.md)); mandate-derived keys **and** reconciliation-by-lookup so Stripe-class (and lookup-capable) APIs auto-resolve in-flight unknowns without dropping at-most-once elsewhere.

**Overall for his critique:** yes — a published crash test with real sample size, a statistical bound, and availability costs stated openly is exactly what he demands. Collaboration angle: Golem + ClawQL covers both sides of _his_ model. Head-to-head waits for a Golem arm on [`COMPARISON.md`](./COMPARISON.md), ideally with his input on configuration.

---

## What “done enough to talk to Golem” means

Minimum before private outreach with numbers:

1. Tiers **A + B + D** green in CI on `main`
2. Tier **C** measured on a 2-node fleet bucket that passes diagnose (**done** — R2 peer kill + phased board; see `phased-evidence.json`)
3. Public copy uses the scoped claim above — not “durable execution engine” / “exactly once”
4. Named Pi Durable / Golem boards still need maintainer invite before public numbers

Peer comparison design (celld = own substrate; Pi Durable + Golem = peers; dual columns + idempotency modes): [`COMPARISON.md`](./COMPARISON.md).

---

## Related

- Comparison board plan — [`COMPARISON.md`](./COMPARISON.md)
- Durable parked-agent density (fair contract) — [`../program-density/STATUS.md`](../program-density/STATUS.md)
- ADR 0015 — [`docs/adr/0015-program-mode-alongside-search-execute.md`](../../adr/0015-program-mode-alongside-search-execute.md)
- Streams evidence — [`docs/streams/streams-celld-evidence.md`](../../streams/streams-celld-evidence.md)
- Security suite roadmap — [`docs/benchmarks/security-suite/ROADMAP.md`](../security-suite/ROADMAP.md)
- Dominance — [`docs/benchmarks/dominance-roadmap.md`](../dominance-roadmap.md)
