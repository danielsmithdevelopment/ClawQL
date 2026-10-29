# Program resume (TLA+)

Model-checks **checkpointed-step** program recovery (claim-path §5), under small bounds:

- A crashed program resumes from journaled step boundaries
- **No completed step re-runs** (`NoCompletedStepRerun`)
- Crash after a write **intent** leaves **`outcome_unknown`** (never silently retried)

This is **not** transparent / mid-line resumption (Golem-class). Still say **“model-checked under bounds,”** never “provably correct.”

## Files

| File                     | Role                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `ProgramResume.tla`      | Spec — steps, intents, journal `completed`, crash/resume             |
| `ProgramResume.cfg`      | TLC — **target** (`WeakAllowCompletedRerun = FALSE`); must pass      |
| `ProgramResumeWeak.cfg`  | TLC — **buggy** (`WeakAllowCompletedRerun = TRUE`); must _fail_ Safety |

## Invariants (target)

1. **NoCompletedStepRerun** — once a step has a journal entry, `runCount[s] ≤ 1`.
2. **OutcomeUnknownHonest** — write side effects ≤ 1; open intents after park drain into `unknown`, not a silent retry.
3. **WriteIntentBeforeEffect** — no phantom write effects without intent / in-flight / completed / unknown.

## Run TLC

```bash
./scripts/formal/run-program-resume-tlc.sh
```

Expect: target config exit 0; weak config exit ≠ 0 with `Safety` / `NoCompletedStepRerun` violated.

## Mapping to code

| Spec              | Code                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `completed`       | `ProgramJournal.entries`                                          |
| `intent`          | `ProgramJournal.intents` (writes)                                 |
| `BeginWrite`      | durable-runner `appendIntent` before host execute                 |
| `Complete*`       | `appendEntry` / land                                              |
| `CrashMid`        | SIGKILL / interrupt mid-call                                      |
| `Resume`          | `execute_program { programId }` / peer failover                   |
| `unknown`         | `outcome_unknown` call records (writes in flight)                 |
| `ReRunCompleted`  | **forbidden** path — weak config proves the invariant has teeth   |

Does **not** yet model `sleep` / `await_approval` / `model_call` as distinct actions, nor multi-replica lease failover (fleet evidence).
