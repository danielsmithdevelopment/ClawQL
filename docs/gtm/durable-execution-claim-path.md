# Path from “never repeats a write” to “durable execution”

**Status:** claim ladder — what is earned today vs what is still required.  
**In progress:** Digest hard-stop + board columns (`completed` / `stepsRepeated` / `statePreserved` / `waitApproval`) plus first-class plan **`sleep`** / **`await_approval`** / **`model_call`** steps. Program TLA+ (`formal/tla/program/ProgramResume`) dual-config oracle is in tree. Fleet `statePreserved` is **exact digest equality** vs a per-trial no-crash twin (not structural shape). Lab N≈1000 overall sizes write-kill + await arms so every column has hundreds of trials. This does **not** yet authorize “durable execution” copy until that evidence lands clean.  
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

| Column              | Meaning                                                         | Status                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Completed**       | % of crashed programs that ran to the end after recovery        | **Measured (n=100 lab)** — outer-phase `rateOuterPhases=1` (48/48). Denominator = outer phases only (`before_intent` + `after_call_before_journal`); the other ~52 mid-flight trials are expected `outcome_unknown` and stay in `n` / `rateAllPhases` — see `trialAccounting` in evidence. Evidence: [`phased-claim-path-columns-n100.json`](../benchmarks/program-cell-fleet-kill/phased-claim-path-columns-n100.json). |
| **Steps repeated**  | Completed steps that ran again (0 for writes; stated for reads) | **Measured (n=100 lab)** — `writeStepsRerun=0` / `journalDivergence=0` on same evidence. Completed reads replay from the journal; interrupted reads re-request once (below).                                                                                                                                                                                                                                             |
| **State preserved** | Final step digests + program result match the no-crash path     | **Digest equality (scoped)** — fleet compares exact canonical digests vs a per-trial no-crash twin (same plan args). Eligible = outer + `completedClean` only (see `trialAccounting`). **Lab board:** the pets mock assigns owner IDs deterministically from the idempotency key, so a twin that *calls* upstream can still match. **Real APIs** assign their own IDs — state equality there holds because resume **replays the journaled response** instead of calling again, not because a second live call would return the same body. Node `compareProgramStepStateEffect` is the unit golden. |

### 2. Every side effect through a journaled step

Writes already do. **Reads, model calls, timers, sleeps, and waits for approval** must too, or recovery cannot reconstruct where the program was. Deadline board: timers survive restarts. Model calls need recording **or** an explicit “re-request on recovery” rule.

**Today:** plan `execute`/`search`/`sleep`/`await_approval`/`model_call` entries + write intents + `clock.startedAt` / `sleep.<i>.wakeAt` / `await_approval.<i>.executionId` / `model_call.<i>.requestDigest` nondet.

**Reads (honest limit):** A completed read is journaled and **replayed** on resume (upstream is not hit again). An interrupted read with no journal entry is **re-requested once**. Resumption therefore assumes that re-read is acceptable — the upstream is repeatable, or the program tolerates a fresh value. If underlying data changed and a later step’s stored args no longer match the plan, recovery **hard-stops** (`journal_divergence`) rather than silently taking a divergent path. We do **not** yet claim that every mid-read crash reconstructs the exact pre-crash bytes without re-request.

**Model calls (honest limit):** A completed `model_call` journals the host response and **replays** it. A crash mid-call with no entry **re-requests once**; the new response may differ from the lost one. Limit in one line: **at most one repeated model request per crash, never a repeated write.**

**Other:** Interrupted sleeps re-arm from the journaled wake deadline; `await_approval` parks while the mandate is pending (observe-only — never consumes).

### 3. Deterministic recovery — or detect when it isn’t

If recovery reruns code between steps, nondeterminism (clock, random, iteration order) must come from the journal, or the path may diverge. Minimum: if a step’s argument digest at a position doesn’t match the journal, **stop and mark unknown** — do not continue. Tools for digest mismatch already exist; wire them as a hard stop.

**Today:** Node `durable-runner` and **ProgramCellDO** both hard-stop on mismatch (`journal_divergence` → program `failed`, no later steps). Product marks **failed** (corrupt journal) rather than `outcome_unknown` (mid-flight write). Board records `journalDivergence` counts.

**State equality — mock board vs real APIs:** The fleet `statePreserved` column measures digest equality against a no-crash twin on a **deterministic mock** (`owners.create` id = `owner_${idempotencyKey}`). That makes a fresh twin call comparable to a resumed journal. On a **real API**, response bodies (IDs, timestamps, server fields) are assigned by the upstream: equality after crash holds because the completed step’s result was **journaled and replayed**, not because re-calling the API would return the same bytes. Do not read the lab digest rate as “two live calls to production always match.”

### 4. Long waits that survive

A program waiting days on an approval must still resume after node restarts and failover. Deadline + fleet results are most of this evidence — make the wait/approval path a first-class board column.

**Today:** **Measured (n=40 lab, 8 await trials)** — survive+complete rate **1.0** (8/8; separate arm, not a filtered subset of write-kill N). Evidence: [`phased-await-state-n40.json`](../benchmarks/program-cell-fleet-kill/phased-await-state-n40.json). Lab N≈1000 sizes this arm to a few hundred trials. ProgramCellDO observe-only park; Node + density `restartSurvival` remain.

### 5. Model extended

Extend the TLA+ spec from single writes to programs: a crashed program eventually completes (under fair scheduling), and no completed step reruns. Check board traces against it. Still: **“model-checked under bounds,”** never “provably correct.”

**Today:** [`formal/tla/program/ProgramResume`](../../formal/tla/program/) — `NoCompletedStepRerun` + `OutcomeUnknownHonest` under `MaxSteps≤3` / `MaxCrashes≤2`; weak config (`WeakAllowCompletedRerun`) must counterexample. Does not yet ingest board JSON traces or model `sleep` / `await_approval` / `model_call` as distinct actions.

---

## What you could then say

> ClawQL runs **step-level checkpointed durable execution**: after a crash or node failure, a program resumes from its last completed step and runs to completion, never repeating a write. Limits: interrupted reads and model calls may re-request once; mid-flight writes are `outcome_unknown` for a person; this is **not** mid-step resumption of unmodified agents.

Name the granularity: **“durable execution with step-level checkpoints.”** On John’s grid that is a defined, respectable position and does **not** imply Golem’s mid-step transparency. Combined with write guarantees for APIs that don’t cooperate, it is a position no one else can claim in full today. **Do not publish that sentence until the N≈1000 fleet evidence is clean against the pass criteria fixed in advance** in [durability STATUS](../benchmarks/durability-proof/STATUS.md) (“N≈1000 claim-path pass criteria”).

---

## Explicitly still out of scope (until designed and measured)

- Transparent / mid-line resumption inside agent code
- Durable processes for unmodified agents
- “Exactly once” for arbitrary remote APIs without keys or lookup
- Any claim that beats Golem / Pi Durable / Infinity on execution durability without a reviewed shared board
