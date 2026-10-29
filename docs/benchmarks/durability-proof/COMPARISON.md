# Durability comparison — crash during an outside write

**Status:** ClawQL + live Pi Durable / Golem measured under `DURABILITY_COMPARISON_LIVE_PEERS=1`  
**Crash point measured:** **outside write in flight** (request visible / sent; result not yet recorded)  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md) · [TLA+ write protocol](../../../formal/tla/write-protocol/)

This board measures **effect** outcomes under one deliberate crash window, not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

**`harnessValid`** means each trial reached a valid protocol outcome for that arm’s rules. It is **not** “the arm behaved well on the product metric.” Read the metric columns on their own.

Peers are measured **out of the box** (no custom reconciliation layer). A Golem developer could write lookup-by-reference by hand with transaction helpers — fair to ask John: “Is there a configuration you’d use for this case?” If the answer is “write the reconciliation yourself,” the ClawQL automatic row stands.

---

## Crash points (five-row board)

| Crash point                 | Peer fairness board | ClawQL companion ([`crash-points-evidence.json`](./comparison/crash-points-evidence.json)) |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| **Outside write in flight** | **Yes** (all arms)  | keys **0/0/N**; neither **0/N/0**                                                          |
| Before write sent           | No                  | keys **0/0/N**; neither **0/N/0** (intent journaled → no blind resend)                     |
| After write acked           | No                  | **0/0/N** both modes                                                                       |
| Idle between steps          | No                  | **0/0/N** both modes                                                                       |
| During model↔tool round     | No                  | Skipped (peer-specific)                                                                    |

The peer fairness table below is still the **in-flight-write** row only — that is the window that produces peer duplicates. Companion rows show ClawQL is clean outside that window too.

---

## Metric columns

| Column                     | Meaning                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Duplicates**             | Same side effect applied twice (e.g. payment charged twice).                                                                 |
| **Interrupted or unknown** | After recovery the agent still does not know whether the charge landed (ClawQL `outcome_unknown` ≡ Pi tool **interrupted**). |
| **Completed exactly once** | Charge landed once **and** the task finished with a known success — catches “interrupted → give up, order never confirmed.”  |

---

## API capability (label every row)

Numbers only mean something when the remote API’s recovery options are labeled:

| `apiCapability`       | Remote offers                                                            | ClawQL after crash mid-write                     | Peers out of the box                         |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| `idempotency_keys`    | Honors Idempotency-Key                                                   | **0 / 0 / N** (keyed resume)                     | 0 dups if they re-send with the same key     |
| `lookup_by_reference` | Exact “charge with this reference?” **and** a definitive guarantee below | **0 / 0 / N** when found or definitive not_found | No automatic path; custom code possible      |
| `neither`             | No keys, no lookup, **no** definitive guarantee                          | **0 / N / 0** (honest floor)                     | **N / 0 / 0** if they retry / re-send        |
| `lookup_race`         | Lookup, but no definitive guarantee yet                                  | **0 / N / 0** (must stay unknown)                | (probe) early not_found must not safe-resend |

### What “definitive” / “can no longer land” means

A client-side timeout is **not** enough — the request may still sit in a load balancer, retry queue, or server backlog. `not_found.definitive` requires a **mechanism the remote service actually guarantees**, named in code and in the TLA+ `ServerGuarantee` action:

| `reason`                      | Assumption recorded on the capability                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `server_enforced_expiry`      | Request carries an expiry the **server** rejects past a maximum age (e.g. signed timestamp). |
| `lookup_covers_prior_accepts` | API documents that this lookup reflects **every** request accepted before it.                |
| `connection_rejected`         | Connection-level response **proved** reject — not silence / unanswered.                      |

Where an API offers **none** of these, early **or late** “not found” stays unknown — never safe to retry. The race arm and `WriteProtocolWeak.cfg` exist to catch trusting not_found without a named guarantee.

---

## Fairness table (API type `neither`) — cells **dup / unk / once**

Latest evidence.json is N=10 (includes race arm); peer ratios match the N=50 pilot.

| Arm (out of the box unless noted) | Model never retries | Model always retries |
| --------------------------------- | ------------------- | -------------------- |
| **Pi Durable**                    | 0 / N / 0           | **N / 0 / 0**        |
| **Golem** (runtime re-send)       | **N / 0 / 0**       | **N / 0 / 0**        |
| **ClawQL** (structural)           | 0 / N / 0           | **0 / N / 0**        |

ClawQL always-retry is **0 duplicates** and **N unknown / 0 completed** — safe but unfinished. That is the honest floor when the API offers neither keys nor lookup.

**Check-then-decide** (`lookup_by_reference`): **0 / 0 / N** — crash mid-write, no keys, lookup finds the charge → every order completed exactly once. Neither peer does that out of the box.

**Race probe** (`clawql-check-then-decide-race`): mock **pauses** the charge; lookup returns not_found while the original may still land → must stay **unknown** (never safe-resend); release applies once → **0 duplicates**. Product rule: `not_found.definitive` only after the original can no longer take effect.

---

## Formal methods (TLA+)

The risky part is the protocol, not a pure function — **TLA+** ([`formal/tla/write-protocol/`](../../../formal/tla/write-protocol/)), not Lean.

Model-checked (bounded): agent retries, crashes, delayed applies, API types keys/lookup/neither. Invariants: no duplicate effect, no false “done”, no unsafe retry (early not_found). Weak config (`WeakEarlyNotFound`) must counterexample — that is the check-then-decide race. Peer-neither + blind retry must counterexample.

Describe results as **model-checked** under stated bounds — never “provably correct.” Trace export: `DURABILITY_COMPARISON_TRACE=1` → `TrialTraceEvent` logs; TypeScript conformance (`trace-conformance.ts`) checks the same safety rules (pass + recorded counterexample shapes in unit tests).

```bash
./scripts/formal/run-write-protocol-tlc.sh
DURABILITY_COMPARISON_TRACE=1 DURABILITY_COMPARISON_N=5 npm run benchmark:durability-comparison
```

---

## Live peer configuration (ask maintainers)

| Arm                             | Framing        | Configuration under test                                                                                  |
| ------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `pi-durable-never-retry`        | out of the box | `replay: "unsafe"`; faux never-retry; SIGKILL mid-execute → 0 / N / 0                                     |
| `pi-durable-always-retry`       | out of the box | faux always re-issues `peer.charge` → neither: N / 0 / 0                                                  |
| `pi-durable-real-model`         | out of the box | Live LLM (`DURABILITY_COMPARISON_PI_REAL_MODEL=1` + API key) — pending without key                        |
| `golem`                         | out of the box | `simulate-crash` mid-hold; runtime re-send; neither → N dups. Ask John: config for lookup reconciliation? |
| `clawql-file-journal`           | structural     | keys → 0 / 0 / N; neither → 0 / N / 0                                                                     |
| `clawql-always-retry`           | structural     | Gate refuses; neither → **0 / N / 0**                                                                     |
| `clawql-check-then-decide`      | structural     | Lookup finds charge → **0 / 0 / N**                                                                       |
| `clawql-check-then-decide-race` | structural     | Paused charge; early not_found → unknown; release → 0 dups                                                |

---

## Arms

| Arm id                               | Stack / policy                        |
| ------------------------------------ | ------------------------------------- |
| `clawql-file-journal`                | Structural; keys + neither            |
| `clawql-always-retry`                | Structural gate under always-retry    |
| `clawql-check-then-decide`           | Lookup-by-reference reconcile         |
| `clawql-check-then-decide-race`      | Lookup race probe (paused request)    |
| `clawql-program-celld`               | ProgramCellDO (skipped in Node board) |
| `pi-durable-never-retry`             | Live Pi + faux never-retry (OOTB)     |
| `pi-durable-always-retry`            | Live Pi + faux always-retry (OOTB)    |
| `pi-durable-real-model`              | Live Pi + real LLM (env-gated)        |
| `golem`                              | Live Golem (OOTB)                     |
| `pi-durable+clawql` / `golem+clawql` | Combination — ClawQL gate side        |

---

## Implementation status

| Piece                                    | Status                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Fairness columns + API capability labels | **Shipped**                                                                           |
| Check-then-decide + race-safe not_found  | **Shipped**                                                                           |
| Race board arm (paused mock)             | **Shipped**                                                                           |
| TLA+ write-protocol (+ weak / peer cex)  | **Shipped** — CI + `./scripts/formal/run-write-protocol-tlc.sh`                       |
| Trace export + conformance checker       | **Shipped** — `trace-conformance.ts` (+ unit cex shapes)                              |
| Crash-point companion rows (ClawQL)      | **Shipped** — [`crash-points-evidence.json`](./comparison/crash-points-evidence.json) |
| Tier F resume vs journal length          | **Measured** (file-journal) — [`resume-vs-journal/`](./resume-vs-journal/)            |
| Real-model Pi                            | Env-gated — needs API key                                                             |
| N=1000 on stable host                    | **After** maintainer feedback                                                         |
| Evidence                                 | [`comparison/evidence.json`](./comparison/evidence.json)                              |

### Commands

```bash
DURABILITY_COMPARISON_N=20 npm run benchmark:durability-comparison
DURABILITY_COMPARISON_LIVE_PEERS=1 DURABILITY_COMPARISON_N=50 npm run benchmark:durability-comparison
DURABILITY_COMPARISON_TRACE=1 DURABILITY_COMPARISON_N=5 npm run benchmark:durability-comparison
DURABILITY_COMPARISON_CRASH_POINTS_N=10 npm run benchmark:durability-crash-points
npm run benchmark:resume-vs-journal
./scripts/formal/run-write-protocol-tlc.sh
```
