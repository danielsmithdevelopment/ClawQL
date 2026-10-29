# Path from “never repeats a write” to “durable execution”

**Status:** claim ladder — what is earned today vs what is still required.  
**In progress (scaffolding):** Digest hard-stop + board columns (`completed` / `stepsRepeated` / `statePreserved` / `waitApproval`) plus first-class plan **`sleep`** / **`await_approval`** / **`model_call`** steps. Program TLA+ (`formal/tla/program/ProgramResume`) dual-config oracle is in tree. Tier C re-measure (n=100 R2) quotes `completed.rateOuterPhases=1` and `stepsRepeated.writeStepsRerun=0`. Fleet can measure `statePreserved` (structural baseline) and `waitApproval` (`FLEET_PHASED_AWAIT_TRIALS`). This does **not** yet authorize “durable execution” copy.  
**Related:** [publish-readiness](./publish-readiness.md) · [golem honesty](./golem-overlap-and-durability-honesty.md) · [durability STATUS](../benchmarks/durability-proof/STATUS.md) · [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md)

---

## Short answer

To say **durable execution**, you must show that the **program** survives — not just its writes: after a crash it resumes on its own from where it was and runs to completion without redoing finished work.

**“Never repeats a write”** is one guarantee _inside_ durable execution. Durable execution is the whole program making progress.

There is no single definition (John’s stream spent early minutes on a taxonomy). Pick a level you can prove and **name it**:

| Level                             | Meaning                                                      | Who sits here                                                   |
| --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| **Checkpointed steps**            | Resume from last completed step; completed steps never rerun | Temporal-class; **within reach for ClawQL**                     |
| **Transparent durable execution** | Resume at the exact line, inside steps; no step boundaries   | Golem-class; needs record-and-replay / snapshot — **not built** |

---

## What ClawQL can say today

> Never repeats a write. Programs resume after a crash on another node; mid-flight writes are marked outcome unknown for a person. Model-checked under bounds.

Do **not** say “durable execution” or “exactly once” in general. See [publish-readiness §1](./publish-readiness.md#1-ready-to-publish-now).

---

## To claim checkpointed-step durable execution

### 1. Program-level resumption, measured

The thousand-crash board already resumes programs but scores duplicates, recovery time, and availability. Add columns durable execution is about:

| Column              | Meaning                                                         | Status                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Completed**       | % of crashed programs that ran to the end after recovery        | **Measured (n=100 lab)** — outer-phase `rateOuterPhases=1` (48/48); all-phase rate ≈0.48 because mid-flight kills expect `outcome_unknown`. Evidence: [`phased-claim-path-columns-n100.json`](../benchmarks/program-cell-fleet-kill/phased-claim-path-columns-n100.json). Stock N=1000 safety claim unchanged. |
| **Steps repeated**  | Completed steps that ran again (0 for writes; stated for reads) | **Measured (n=100 lab)** — `writeStepsRerun=0` / `journalDivergence=0` on same evidence. Read re-runs still stated separately when interrupted.                                                                                                                                                                |
| **State preserved** | Program variables between steps match the no-crash path         | **Measured (n=40 lab)** — structural rate **1.0** (20/20 outer). Evidence: [`phased-await-state-n40.json`](../benchmarks/program-cell-fleet-kill/phased-await-state-n40.json). Node `compareProgramStepStateEffect` remains the strict unit golden.                                                            |

### 2. Every side effect through a journaled step

Writes already do. **Reads, model calls, timers, sleeps, and waits for approval** must too, or recovery cannot reconstruct where the program was. Deadline board: timers survive restarts. Model calls need recording **or** an explicit “re-request on recovery” rule.

**Today:** plan `execute`/`search`/`sleep`/`await_approval`/`model_call` entries + write intents + `clock.startedAt` / `sleep.<i>.wakeAt` / `await_approval.<i>.executionId` / `model_call.<i>.requestDigest` nondet. Interrupted reads without an entry re-run once; interrupted sleeps re-arm from the journaled wake deadline; `await_approval` parks while the mandate is pending (observe-only — never consumes); `model_call` journals the host response and **replays** on resume (crash mid-call with no entry **re-requests once**).

### 3. Deterministic recovery — or detect when it isn’t

If recovery reruns code between steps, nondeterminism (clock, random, iteration order) must come from the journal, or the path may diverge. Minimum: if a step’s argument digest at a position doesn’t match the journal, **stop and mark unknown** — do not continue. Tools for digest mismatch already exist; wire them as a hard stop.

**Today:** Node `durable-runner` and **ProgramCellDO** both hard-stop on mismatch (`journal_divergence` → program `failed`, no later steps). Product marks **failed** (corrupt journal) rather than `outcome_unknown` (mid-flight write). Board records `journalDivergence` counts.

### 4. Long waits that survive

A program waiting days on an approval must still resume after node restarts and failover. Deadline + fleet results are most of this evidence — make the wait/approval path a first-class board column.

**Today:** **Measured (n=40 lab, 8 await trials)** — survive+complete rate **1.0**. Evidence: [`phased-await-state-n40.json`](../benchmarks/program-cell-fleet-kill/phased-await-state-n40.json). ProgramCellDO observe-only park; Node + density `restartSurvival` remain.

### 5. Model extended

Extend the TLA+ spec from single writes to programs: a crashed program eventually completes (under fair scheduling), and no completed step reruns. Check board traces against it. Still: **“model-checked under bounds,”** never “provably correct.”

**Today:** [`formal/tla/program/ProgramResume`](../../formal/tla/program/) — `NoCompletedStepRerun` + `OutcomeUnknownHonest` under `MaxSteps≤3` / `MaxCrashes≤2`; weak config (`WeakAllowCompletedRerun`) must counterexample. Does not yet ingest board JSON traces or model `sleep` / `await_approval` / `model_call` as distinct actions.

---

## What you could then say

> ClawQL runs programs durably: after a crash or node failure, a program resumes from its last completed step and runs to completion, never repeating a write.

Name the granularity: **“durable execution with step-level checkpoints.”** On John’s grid that is a defined, respectable position and does **not** imply Golem’s mid-step transparency. Combined with write guarantees for APIs that don’t cooperate, it is a position no one else can claim in full today.

---

## Explicitly still out of scope (until designed and measured)

- Transparent / mid-line resumption inside agent code
- Durable processes for unmodified agents
- “Exactly once” for arbitrary remote APIs without keys or lookup
- Any claim that beats Golem / Pi Durable / Infinity on execution durability without a reviewed shared board
