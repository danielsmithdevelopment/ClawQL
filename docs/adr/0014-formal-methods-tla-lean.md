# ADR 0014: Formal methods — TLA+ for protocols, Lean for policy

- Status: Accepted
- Date: 2026-10-07
- Related: [ADR 0013 gdp-ts](./0013-gdp-ts-compile-time-auth-proofs.md), [ADR 0015 program mode](./0015-program-mode-alongside-search-execute.md) (batch Merkle mandates + Lean IFC), [correctness by construction](../design/correctness-by-construction.md), [execute pause/resume](../specs/risk/execute-pause-resume-v0.1.md), [`formal/tla/mandate/`](../../formal/tla/mandate/), [`formal/tla/events/`](../../formal/tla/events/), [`formal/lean/`](../../formal/lean/)

## Context

ClawQL’s risk splits into two classes E2E and gdp-ts do not close:

1. **Concurrency and protocol bugs** — races across gateway replicas, retries, expiry, resume.
2. **Decision logic bugs** — risk classification, approval policy, information-flow, mandate binding.

Lean and TLA+ (or Quint) are the mature tools for those halves. Bend is watch-only. Verus/Kani remain later for celld’s Rust sandbox core.

## Decision

1. **TLA+/Quint for protocol state machines** — mandates (shipped), event delivery (at-least-once + stable ID + receiver dedup).
2. **Lean for the policy-kernel oracle** — approval-policy evaluation first; differential + exhaustive tests vs production TypeScript.
3. **gdp-ts** stays layer-1 compile-time capability flow ([ADR 0013](./0013-gdp-ts-compile-time-auth-proofs.md)).
4. **pstack / E2E** stay runtime evidence.
5. **Managed multi-node mandates use Postgres** — same conditional `UPDATE…WHERE` / `NOW()` shape as the TLA+ Consume action (`CLAWQL_PENDING_DATABASE_URL`). SQLite is for single-node self-host only.

### Shared-store atomicity (mandates)

| Backend         | When                                                                                                                                          | Cross-process      | Cross-node                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------ |
| **Postgres**    | `CLAWQL_PENDING_DATABASE_URL`, or managed multi-node signals (`CLAWQL_MANAGED_GATEWAY=1`, `CLAWQL_GATEWAY_REPLICAS>1`, cloud console surface) | Yes                | **Yes — required for managed** |
| SQLite          | Default single-node self-host                                                                                                                 | Yes (shared file)  | No                             |
| File + lockfile | `CLAWQL_PENDING_STORE=file`                                                                                                                   | Shared volume only | No                             |

Managed cloud **must** set `CLAWQL_PENDING_DATABASE_URL` (Helm: `pendingDatabaseUrl`). Without it, consume fails closed rather than silently using per-node SQLite. Two-process race tests cover both SQLite and Postgres.

### Outcome-unknown retries

Automatic retry only when `idempotencyCapable`. Otherwise Review: mark applied / mark not applied / retry with key. Attention threshold: **60s**.

### Event delivery guarantee

**At-least-once with stable event ID; receivers that dedupe process once.** Not true exactly-once over HTTP. Launch video caption must say **“processed once”**, not “delivered once” ([`formal/tla/events/README.md`](../../formal/tla/events/README.md)).

### Lean non-vacuity

CI fails on `sorry` / `admit`. Differential: 5000 random + exhaustive small domain.

### Managed WORM audit hunt (pre-launch) — owner & date

| Field                     | Value                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Owner**                 | Daniel Smith (`daniel@clawql.com`)                                                                                          |
| **Due**                   | **2026-10-09** (hard gate before launch announcement)                                                                       |
| **Script**                | `node scripts/formal/audit-mandate-double-execute.mjs --dir <export>` or against Postgres WORM (`CLAWQL_WORM_POSTGRES_URL`) |
| **Agent VM (2026-10-07)** | No managed WORM credentials — hunt not runnable from CI agents                                                              |
| **Production result**     | _TBD — owner fills count (including **zero**) before announcement_                                                          |

Do not claim “never happened in the wild” until the production result row is filled.

### Security-page claim (earned wording)

After Postgres is live on managed, TLC CI green, Lean gates green, and the WORM hunt result is recorded:

> The mandate protocol is model-checked with TLA+, including crash and expiry boundaries, and the approval policy rules are proved in Lean and differential-tested against production.

Events copy must stay consistent: **same event ID, processed once** (not “delivered once”).

## Consequences

- Protocol changes update TLA+ specs; weak configs remain regression oracles.
- Scaling managed gateways without `CLAWQL_PENDING_DATABASE_URL` is a launch blocker.
- Unfinished Lean proofs fail CI.
- Video / Automations / security copy uses “processed once” for events.
