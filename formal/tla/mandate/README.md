# Mandate lifecycle (TLA+)

Model-checks the pending-execution / mandate protocol:

`park → approve|decline|expire → consume → side effect → finalize`

with crash-after-consume leaving **`outcome_unknown`** (never silently retried).

**Claim to protect:** approved once, for this exact change (canonical args digest), never by the requester.

## Files

| File                       | Role                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `MandateLifecycle.tla`     | Spec — states, actions, invariants                                   |
| `MandateLifecycle.cfg`     | TLC — **atomic** target (`WeakConsume = FALSE`); must pass           |
| `MandateLifecycleWeak.cfg` | TLC — **legacy race** (`WeakConsume = TRUE`); must _fail_ Safety     |
| `BatchMandate.tla`         | ADR 0015 — batch Merkle root approve + inclusion consume             |
| `BatchMandate.cfg`         | TLC — Safety must pass (`./scripts/formal/run-batch-mandate-tlc.sh`) |

## Invariants (target)

1. **AtMostOneSideEffect** — a mandate id is never successfully executed more than once.
2. **DigestMatch** — consume/execute only when live digest equals parked digest (also after `TamperPendingDigest`).
3. **NoExecuteAfterExpiry** — consume requires `clock < expiresAt` (store clock).
4. **ApproverNotRequester** / no double-count — approvals are a set; quorum of distinct people.
5. **OutcomeUnknownHonest** — crash after consume leaves `outcome_unknown` with ≤1 side effect.

## Today vs target (code)

Production now implements **atomic consume** (`tryConsumeApprovedEffect`):
`approved` → `outcome_unknown` under a file lock with digest + expiry predicate, then side effect, then `completed`/`failed`.

`WeakConsume = TRUE` retains the historical counterexample (double execute while still `approved`) so CI proves the invariant still has teeth.

## Run TLC

```bash
# From repo root (or formal/tla/mandate with jar on CLASSPATH)
./scripts/formal/run-mandate-tlc.sh
```

Expect: atomic config exit 0; weak config exit ≠ 0 with `Safety` / `AtMostOneSideEffect` violated.

## Mapping to code

| Spec                  | Code                                                     |
| --------------------- | -------------------------------------------------------- |
| `Park`                | `PendingExecutionService.park`                           |
| `Approve` / `Decline` | `decide`                                                 |
| `TamperPendingDigest` | args change while pending (digest re-bind)               |
| `Consume`             | `tryConsumeApprovedEffect` / `tryConsumeApprovedMandate` |
| `SideEffect`          | execute body after consume                               |
| `Finalize`            | `markCompleted`                                          |
| Digests               | `hashPendingArgsEffect` / `args-hash.ts`                 |
| Idempotency           | `mandateIdempotencyKey(executionId)` for Stripe etc.     |

## Audit hunt (production)

Search WORM for any mandate with **two** `MANDATE_CONSUMED` (or two successful executes) for the same `executionId`:

```bash
node scripts/formal/audit-mandate-double-execute.mjs --help
```
