# Durability comparison — crash during an outside write

**Status:** ClawQL + live Pi Durable / Golem measured under `DURABILITY_COMPARISON_LIVE_PEERS=1`  
**Crash point on the peer fairness table:** **outside write in flight** (request visible / sent; result not yet recorded)  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md) · [TLA+ write protocol](../../../formal/tla/write-protocol/)  
**Fixed reference:** tag [`durability-pilot-v1`](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/durability-pilot-v1) (not a moving PR tip) · [`comparison/PACKAGE-MANIFEST.json`](./comparison/PACKAGE-MANIFEST.json) (evidence SHA-256)  
**Review window:** feedback by **13 November 2026** is included before any social/marketing promotion. The repo is public; promotion is what’s held.

This board measures **effect** outcomes under one deliberate crash window, not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

**`harnessValid`** means each trial reached a valid protocol outcome for that arm’s rules. It is **not** “the arm behaved well on the product metric.” Read the metric columns on their own.

Peers are measured **out of the box** (no custom reconciliation layer). A Golem developer could write lookup-by-reference by hand with transaction helpers — fair to ask John: “Is there a configuration you’d use for this case?” If the answer is “write the reconciliation yourself,” the ClawQL automatic row stands.

**Sample-size honesty:** with **0** events in N trials, a one-sided **95% upper bound** on the true rate is `1 − 0.05^(1/N)` (about **26%** at N=10, about **6%** at N=50). Small-N zero counts are harness checks (“behaves as designed”), not rate claims. Fold into N=1000 after maintainer feedback.

---

## Coverage matrix (crash point × arm)

Cells: **measured** (N, and the **95% upper bound** when zeros) or **not measured**. Peers are only measured at **outside write in flight** so far — that is intentional and visible here.

**95% upper bound** (zero events) = `1 − 0.05^(1/N)` when the quoted product metric is a zero count (e.g. 0 duplicates).

| Crash point ↓ \\ Arm →      | ClawQL structural                                                                      | Pi Durable (OOTB) | Golem (OOTB)      |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------- | ----------------- |
| **Outside write in flight** | **measured** N=50 (95% upper bound ≈6% on zero-dup cells) — peer fairness table        | **measured** N=50 | **measured** N=50 |
| Before write sent           | **measured** N=50 ClawQL companion — behaves as designed (keys 0/0/50; neither 0/50/0) | not measured      | not measured      |
| After write acked           | **measured** N=50 ClawQL companion — behaves as designed (0/0/50)                      | not measured      | not measured      |
| Idle between steps          | **measured** N=50 ClawQL companion — behaves as designed (0/0/50)                      | not measured      | not measured      |
| During model↔tool round     | not measured (peer-specific)                                                           | not measured      | not measured      |

ClawQL companion evidence: [`crash-points-evidence.json`](./comparison/crash-points-evidence.json). Invite: run peer arms at the other crash points once configs are agreed.

---

## Metric columns

| Column                     | Meaning                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Duplicates**             | Same side effect applied twice (e.g. payment charged twice).                                                                 |
| **Interrupted or unknown** | After recovery the agent still does not know whether the charge landed (ClawQL `outcome_unknown` ≡ Pi tool **interrupted**). |
| **Completed exactly once** | Charge landed once **and** the task finished with a known success — catches “interrupted → give up, order never confirmed.”  |

### Reading `neither` → **0 / N / 0** (intended, not broken)

When the API offers **neither** idempotency keys nor lookup-by-reference (and no named definitive guarantee), ClawQL:

1. Journals the write **intent** before the host call
2. After a mid-flight crash, **refuses to resend blindly** (approval already consumed)
3. Marks the call **`outcome_unknown`**

That is the honest floor: **0 duplicates**, N unknown, 0 completed-exactly-once. Safe but unfinished until a person (or a later reconciliation path) resolves the unknown — mark applied / not applied, or wait for keys/lookup. Do **not** read the N in the unknown column as a failure rate of the harness.

---

## API capability (label every row)

Numbers only mean something when the remote API’s recovery options are labeled:

| `apiCapability`       | Remote offers                                                            | ClawQL after crash mid-write                     | Peers out of the box                         |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| `idempotency_keys`    | Honors Idempotency-Key                                                   | **0 / 0 / N** (keyed resume)                     | 0 dups if they re-send with the same key     |
| `lookup_by_reference` | Exact “charge with this reference?” **and** a definitive guarantee below | **0 / 0 / N** when found or definitive not_found | No automatic path; custom code possible      |
| `neither`             | No keys, no lookup, **no** definitive guarantee                          | **0 / N / 0** (honest floor — see above)         | **N / 0 / 0** if they retry / re-send        |
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

Pinned tip evidence: [`comparison/evidence.json`](./comparison/evidence.json) (see PACKAGE-MANIFEST for commit + hash). N=50 on one tip for all arms below.

| Arm (out of the box unless noted) | Model never retries | Model always retries |
| --------------------------------- | ------------------- | -------------------- |
| **Pi Durable**                    | 0 / N / 0           | **N / 0 / 0**        |
| **Golem** (runtime re-send)       | **N / 0 / 0**       | **N / 0 / 0**        |
| **ClawQL** (structural)           | 0 / N / 0           | **0 / N / 0**        |

ClawQL always-retry is **0 duplicates** and **N unknown / 0 completed** — intended when the API offers neither keys nor lookup (see above).

**Check-then-decide** (`lookup_by_reference`): **0 / 0 / N** — crash mid-write, no keys, lookup finds the charge → every order completed exactly once. Neither peer does that out of the box.

**Race probe** (`clawql-check-then-decide-race`): mock **pauses** the charge; lookup returns not_found while the original may still land → must stay **unknown** (never safe-resend); release applies once → **0 duplicates**. Product rule: `not_found.definitive` only after the original can no longer take effect.

---

## Formal methods (TLA+) + trace conformance

The risky part is the protocol, not a pure function — **TLA+** ([`formal/tla/write-protocol/`](../../../formal/tla/write-protocol/)), not Lean.

Model-checked (bounded): agent retries, crashes, delayed applies, API types keys/lookup/neither. Invariants: no duplicate effect, no false “done”, no unsafe retry (early not_found). Weak config (`WeakEarlyNotFound`) must counterexample — that is the check-then-decide race. Peer-neither + blind retry must counterexample.

**Claim style:** _model-checked_ under stated TLC bounds — never “provably correct.”

**Trace conformance (TypeScript bridge):** `DURABILITY_COMPARISON_TRACE=1` exports `TrialTraceEvent` logs; `trace-conformance.ts` checks those logs against the **same safety rules** the model encodes. Precise wording: _every exported trace from these runs satisfies the model’s safety rules_ — not “the implementation is verified.”

On the pinned tip ([`trace-conformance-summary.json`](./comparison/trace-conformance-summary.json)): crash-point board N=50 with TRACE → **1500** events checked, ok; ClawQL arms of the N=50 table with TRACE → **1550** events checked, ok. Unit tests also record the weak early-not_found and blind-retry **counterexample** shapes.

```bash
./scripts/formal/run-write-protocol-tlc.sh
```

---

## Tier F — resume vs journal length (lab context)

Single-host file-journal probe ([`resume-vs-journal/`](./resume-vs-journal/)): local JSONL journal, **append + fsync per journaled call**. Measured **up to 500 steps** on this host — do not extrapolate. Prefer: **snapshots not needed up to 500 steps** (not a general “snapshots never needed”).

Not fleet lease failover (Tier C ~12s p50).

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

## Reproduce (fixed tag)

All package numbers should come from tag **`durability-pilot-v1`** (see [`PACKAGE-MANIFEST.json`](./comparison/PACKAGE-MANIFEST.json) for evidence hashes).

```bash
git checkout durability-pilot-v1
# Peer fairness board (outside-write) + live peers
DURABILITY_COMPARISON_LIVE_PEERS=1 DURABILITY_COMPARISON_N=50 \
  npm run benchmark:durability-comparison
# ClawQL crash-point companion + trace conformance
DURABILITY_COMPARISON_CRASH_POINTS_N=50 DURABILITY_COMPARISON_TRACE=1 \
  npm run benchmark:durability-crash-points
# ClawQL arms of the N=50 table with TRACE (writes a side evidence path; does not replace peer table)
DURABILITY_COMPARISON_LIVE_PEERS=0 DURABILITY_COMPARISON_N=50 DURABILITY_COMPARISON_TRACE=1 \
  DURABILITY_COMPARISON_EVIDENCE_PATH=/tmp/clawql-n50-trace-evidence.json \
  npm run benchmark:durability-comparison
# Tier F
DURABILITY_RESUME_JOURNAL_STEPS=10,50,200,500 npm run benchmark:resume-vs-journal
# TLC (pass + recorded counterexamples)
./scripts/formal/run-write-protocol-tlc.sh
# Refresh hashes after regenerating evidence
node scripts/benchmarks/durability-comparison/write-package-manifest.mjs
```

Verify evidence file SHA-256 against the manifest before quoting numbers.

---

## Implementation status

| Piece                                    | Status                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Fairness columns + API capability labels | **Shipped**                                                                 |
| Check-then-decide + race-safe not_found  | **Shipped**                                                                 |
| Race board arm (paused mock)             | **Shipped**                                                                 |
| TLA+ write-protocol (+ weak / peer cex)  | **Shipped** — CI + `./scripts/formal/run-write-protocol-tlc.sh`             |
| Trace export + conformance checker       | **Shipped** — covers crash-points N=50 + ClawQL N=50 TRACE runs             |
| Crash-point companion rows (ClawQL)      | **Measured N=50** — harness check; fold into N=1000 later                   |
| Coverage matrix                          | **In this doc**                                                             |
| Tier F resume vs journal length          | **Measured up to 500 steps** — [`resume-vs-journal/`](./resume-vs-journal/) |
| Real-model Pi                            | Env-gated — needs API key                                                   |
| N=1000 on stable host                    | **After** maintainer feedback                                               |
| Evidence                                 | [`comparison/evidence.json`](./comparison/evidence.json) + PACKAGE-MANIFEST |
