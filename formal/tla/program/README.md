# Program resume (TLA+)

Model-checks **checkpointed-step** program recovery (claim-path §5), under small bounds:

- A crashed program resumes from journaled step boundaries
- **No completed step re-runs** (`NoCompletedStepRerun`)
- Crash after a **durable** write intent leaves **`outcome_unknown`** (never silently retried)
- Host send only after **durable intent ack** (`IntentDurablyAckedBeforeSend`)

This is **not** transparent / mid-line resumption (Golem-class). Still say **“model-checked under bounds,”** never “provably correct.”

## Files

| File                          | Role                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `ProgramResume.tla`           | Spec — steps, intents, durable ack, journal `completed`, crash/resume             |
| `ProgramResume.cfg`           | TLC — **target** (both weak flags FALSE); must pass                               |
| `ProgramResumeWeak.cfg`       | TLC — buggy completed re-run; must _fail_ Safety                                  |
| `ProgramResumeWeakSend.cfg`   | TLC — buggy send before durable ack; must _fail_ `IntentDurablyAckedBeforeSend` |

## Invariants (target)

1. **NoCompletedStepRerun** — once a step has a journal entry, it is not host-invoked again.
2. **OutcomeUnknownHonest** — write side effects ≤ 1; open *durable* intents after park drain into `unknown`, not a silent retry.
3. **WriteIntentBeforeEffect** — no phantom write effects without durable intent / in-flight / completed / unknown.
4. **IntentDurablyAckedBeforeSend** — `midFlight = s` for a write ⇒ `s ∈ durableAcked` (journal put alone is not enough).

## Run TLC

```bash
./scripts/formal/run-program-resume-tlc.sh
```

Expect: target config exit 0; weak completed-rerun and weak send-without-ack exit ≠ 0.

## Trace conformance (board / fixtures)

```bash
node scripts/formal/check-intent-durable-before-send.mjs
# or: node scripts/formal/check-intent-durable-before-send.mjs path/to/trace.json
```

Every `host_send` / `upstream_fetch_start` must be preceded by `intent_durable_ack` for that step. Built-in fixtures include the during_call R2-settle shape (send without ack → fail).

## Mapping to code

| Spec                   | Code                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `intent`               | `ProgramJournal.intents` / DO `program:…:intent:N` (put issued)      |
| `durableAcked`         | fsync / LTX ack / storage-visible re-get before send                 |
| `JournalWriteIntent`   | `appendIntent` / `storage.put(intent)`                               |
| `AckDurableIntent`     | host `fh.sync()`; celld: re-get barrier until real sync exists       |
| `BeginWriteSend`       | host execute / `executeCall` / upstream `fetch`                      |
| `CrashLoseUnacked`     | kill after put returns but before durable — intent lost (R2 settle)  |
| `CrashMid`             | SIGKILL after durable intent, mid-call                               |
| `Resume`               | `execute_program` / peer failover → `outcome_unknown` for open acked |
| `ReRunCompleted`       | **forbidden** — weak completed-rerun config                          |
| send without ack       | **forbidden** — weak send config                                     |

Does **not** yet model `sleep` / `await_approval` / `model_call` as distinct actions, nor multi-replica lease failover (fleet evidence). Board JSON timelines should emit `intent_durable_ack` events once the harness records storage-visible confirmation.
