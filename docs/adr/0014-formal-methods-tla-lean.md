# ADR 0014: Formal methods — TLA+ for protocols, Lean for policy

- Status: Accepted
- Date: 2026-10-07
- Related: [ADR 0013 gdp-ts](./0013-gdp-ts-compile-time-auth-proofs.md), [correctness by construction](../design/correctness-by-construction.md), [execute pause/resume](../specs/risk/execute-pause-resume-v0.1.md), [`formal/tla/mandate/`](../../formal/tla/mandate/), [`formal/tla/events/`](../../formal/tla/events/), [`formal/lean/`](../../formal/lean/)

## Context

ClawQL’s risk splits into two classes E2E and gdp-ts do not close:

1. **Concurrency and protocol bugs** — races across gateway replicas, retries, expiry, resume. E2E almost never enumerates interleavings.
2. **Decision logic bugs** — risk classification, approval policy, information-flow, mandate binding. Types catch missing proofs; they do not prove the policy function itself.

Lean and TLA+ (or Quint) are the mature tools for those halves. Bend aims at a similar niche with agent-speed checks but is not yet mature enough to adopt. Verus/Kani remain a later option for celld’s Rust sandbox core.

## Decision

1. **Adopt TLA+ (or Quint) for distributed protocol state machines.** First target: **mandate lifecycle** (shipped). Next: **event delivery** ([`formal/tla/events/`](../../formal/tla/events/)). Follow-ons: resumable jobs, skill-promotion races.
2. **Adopt Lean for the policy kernel oracle** — not as production runtime. Tight first slice: approval-policy evaluation only ([`formal/lean/`](../../formal/lean/)).
3. **Keep gdp-ts as layer-1** ([ADR 0013](./0013-gdp-ts-compile-time-auth-proofs.md)).
4. **Keep pstack / E2E as runtime evidence.**
5. **Watch Bend; do not block on it.**
6. **Ship specs under `formal/`.**

### Shared-store atomicity (mandates)

Atomic consume is only multi-replica-safe when the conditional write runs in a **shared store**:

| Backend | Cross-process? | Cross-node? |
| --- | --- | --- |
| SQLite (`CLAWQL_PENDING_STORE=sqlite`, default) | Yes — `UPDATE…WHERE` + `BEGIN IMMEDIATE` | Only if every replica shares the DB file (not managed multi-node) |
| JSON + lockfile (`CLAWQL_PENDING_STORE=file`) | Only on a shared volume | No |
| Postgres `UPDATE…RETURNING` (planned) | Yes | Yes — required for managed multi-node |

The 50-way race test includes a **two-process** fork sharing one SQLite file (not 50 calls in one process alone).

### Outcome-unknown retries

Automatic retry after `outcome_unknown` is allowed **only** when the parked operation is `idempotencyCapable` (connector honors `Idempotency-Key` / `clawql-mandate:<executionId>`). Otherwise Review offers: **mark applied**, **mark not applied**, or (if capable) **retry with key**. Review lists `outcome_unknown` only after **60s** without finalize so healthy runs do not flash alarms.

### Lean non-vacuity

- CI greps `formal/lean/**/*.lean` for `sorry` / `admit` (`scripts/formal/check-lean-no-sorry.sh`).
- Differential suite: 5000 random cases **and** exhaustive small domain (≤3 people × policies × actions).

### Managed WORM audit hunt (pre-launch)

Script: `node scripts/formal/audit-mandate-double-execute.mjs`.

| Store probed (2026-10-07, agent VM) | Result |
| --- | --- |
| Local `~/.ClawQL` / process `CLAWQL_WORM_*` | **No managed WORM credentials or Postgres URL in this environment** — hunt not runnable against production from here |
| Local NDJSON / memory trails in unit tests | N/A for launch |

**Operator action before announcement:** run the hunt against the **managed** WORM store (`CLAWQL_WORM_LOCAL=postgres` + `CLAWQL_WORM_POSTGRES_URL`, and/or S3 remote export) and append the count here (including **zero**). Until that row is filled with a production result, do not claim “never happened in the wild.”

### Security-page claim (earned wording)

Once TLC CI is green, atomic SQLite/Postgres consume is deployed, Lean sorry-gate + differential/exhaustive tests pass, and the managed audit hunt result is recorded above:

> The mandate protocol is model-checked with TLA+, including crash and expiry boundaries, and the approval policy rules are proved in Lean and differential-tested against production.

Link this ADR. Exact words live on [`/security`](https://docs.clawql.com/security).

## Consequences

- Protocol changes update TLA+/Quint specs; weak configs remain regression oracles.
- Multi-node managed gateways must not rely on file-lock CAS — ship Postgres consume before scaling replicas across nodes.
- Policy changes update Lean + differential/exhaustive suites; unfinished proofs fail CI.
- Event-delivery TLC dual configs follow the same atomic/weak pattern as mandates.
