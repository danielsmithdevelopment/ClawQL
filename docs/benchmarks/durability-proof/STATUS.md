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

### N≈1000 lab — fail report (criteria unchanged; snapshot while run continues)

Evidence: [`phased-n1000-claim-path.json`](../program-cell-fleet-kill/phased-n1000-claim-path.json) (`status=partial` until write-kill + await finish). **Frozen criteria above are not loosened.** Snapshot at ~430/750 write-kill (await not started):

| Gate               | Result (so far)                          | Cause                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicates         | **PASS** 0                               | —                                                                                                                                                                                                                                                                                        |
| Journal divergence | **PASS** 0                               | —                                                                                                                                                                                                                                                                                        |
| Write steps rerun  | **PASS** 0                               | —                                                                                                                                                                                                                                                                                        |
| Resume deadline    | **FAIL** 4 misses                        | Known celld availability: survivor `SELF-FENCE` (code 3) → rebuild inside resume clock; `resumeMs` can run to minutes (e.g. trial 132 ≈904s; worst so far ≈2720s). Rate ~1%, in line with stock board **0.9%** deadline / **0.6%** fence — not a fluke. Tail stays visible in evidence.  |
| Completed (outer)  | **FAIL** 213/215                         | **Both** outer incompletes are availability/harness, not divergent program state: (1) trial **132** `before_intent` — `resumeDeadlineMiss` after fence ~130; (2) trial **276** `before_intent` — `pause failed: fetch failed` after fence ~270. `after_call_before_journal` still clean. |
| State preserved    | **FAIL** rate &lt;1 (1 miss in eligible) | **Classified: `twin_capture_failed`, not digest mismatch.** Resumed journal was not shown to differ; the no-crash twin never completed (twin shares the same fleet — fences can kill the capture). Still counts as fail under frozen criteria.                                           |
| Wait approval      | pending                                  | Arm not started                                                                                                                                                                                                                                                                          |
| Mid-flight honesty | mostly                                   | Some mid-flight trials miss `outcome_unknown` when resume deadline misses first — same availability storm                                                                                                                                                                                |

**Do not just re-run the same board under the zero-deadline criteria.** ~0.9% self-fence matches the published stock availability cost; that gate will fail again on unchanged celld. **Chosen path (locked Friday, Oct 30, 2026 before the next run starts):** option 2 — split correctness vs availability. Celld availability fixes proceed **in parallel** (not a blocker); when they land, a later re-measure can show deadline-miss rate falling from X% to Y%.

### N≈1000 claim-path pass criteria v2 — correctness / availability split (fixed before re-run — Friday, Oct 30, 2026)

**Why the criteria changed (stated before the new run):** The v1 board required zero resume deadline misses. That mixes **wrong outcomes** (correctness) with **no outcome in time** (availability). The published Tier C claim already discloses availability as a rate (0.6% self-fence / 0.9% deadline miss). v2 matches that structure. **v1 evidence stays published** at [`phased-n1000-claim-path.json`](../program-cell-fleet-kill/phased-n1000-claim-path.json) as a failed zero-deadline board; v2 evidence target: [`phased-n1000-correctness-availability.json`](../program-cell-fleet-kill/phased-n1000-correctness-availability.json). Harness: `FLEET_PHASED_SCORE_MODE=correctness_availability_v2`.

**Definitions (outcome, not column):**

| Class                    | Meaning                          | Counts as                                                                                                                                        |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Correctness failure**  | A **wrong** outcome              | duplicate write; `journal_divergence`; write-step rerun; **digest mismatch** (`statePreserved.reason === digest_mismatch`)                       |
| **Availability failure** | **No** outcome in **wall-clock** time / capture | resume deadline miss (**wall clock, recovery inclusive**); pause failure (`pause failed: …`); **twin_capture_failed**; await arm that does not survive+complete without a wrong write |
| **Outer completion**     | Reported overall                 | Each outer miss is assigned to correctness **or** availability above — not a third zero-gate                                                     |

**Pass gates (frozen for v2 — do not loosen after results):**

| Gate                     | Pass iff                                                              | Note                                                                                                            |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Correctness**          | `gates.correctness.failures === 0`                                    | Zero wrong outcomes across write-kill + await                                                                   |
| **Availability ceiling** | `gates.availability.failureRate ≤ 0.02` (2%)                          | Denominator = all write-kill + await trials (`overallN`). Consistent with published ~1.5%-class disclosure band. Deadline / “in time” = **wall clock including orchestrator recovery** — a 15-minute stall is a miss |
| **Availability tail**    | Evidence reports `resumeMs.p99`/`max`, `recoveryMs.p99`/`max`, and `resumeActiveMs` | **Reported without a pass/fail ceiling.** Diagnostic split only: wall `resumeMs` = active + recovery. A 904s stall must stay visible and must count toward the rate gate when it exceeds the resume deadline |
| **Outer completion**     | Reported with per-miss class                                          | Informational for the claim; misses classified, not required to be 0 if they are availability                   |
| **Wait approval**        | Wrong-write → correctness; no survive/complete in time → availability | Same split; “in time” is wall clock                                                                             |
| **Board ok**             | Correctness zero **and** availability ≤ 2%                            | `status=measured` only when both arms finish                                                                    |

**Claim if v2 clean:** step-level checkpointed durable execution on **correctness** (never a wrong write / digest), with **availability disclosed** (fence + deadline + pause/twin-capture rates ≤2%; resume/recovery p99/max reported, no separate tail ceiling). Still not mid-step unmodified agents. Parallel celld product work (not a v2 gate): lease renew / lease-sweep / alive-vs-ready / **pause-aware clocks** (host pause/suspend — wall time jumps while the machine was not running; distinct from orchestrator recovery). Do **not** freeze the resume deadline during `ensureSurvivor`/rebuild — that would quietly loosen the availability criterion.

## Scoped Tier C claim (measured — stock R2)

> Across 1,000 crashes injected at every phase of a write, programs resumed on another node with no repeated writes (the 95% upper bound on the duplicate rate is 0.3%). The median resume took about 12 seconds, set by the lease timeout. Writes caught mid-flight are marked outcome unknown for a person to resolve. Under stock settings, 0.6% of surviving nodes paused themselves for safety, and 0.9% of resumes missed the recovery deadline.

Every number is measured. Availability costs are stated rather than left for the reader to discover. Scope: two celld nodes, one storage provider (Cloudflare R2). Avoid “durable execution” and “exactly once.”

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
