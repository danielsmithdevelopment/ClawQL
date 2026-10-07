# Mandate lifecycle (TLA+)

Model-checks the pending-execution / mandate protocol: park → approve|decline|expire → execute → complete.

**Claim to protect:** approved once, for this exact change (canonical args digest), never by the requester.

## Files

| File | Role |
| --- | --- |
| `MandateLifecycle.tla` | Spec — states, actions, invariants |
| `MandateLifecycle.cfg` | TLC config (2 replicas, small bounds) |

## Invariants (target)

1. **AtMostOneSideEffect** — a mandate id is never successfully executed more than once.
2. **DigestMatch** — execute only when live digest equals parked digest.
3. **NoExecuteAfterExpiry** — execute never after `expiresAt`.
4. **NoExecuteUnlessApproved** — execute only from `approved`.
5. **ApproverNotRequester** — approve only when `approver ≠ requester` (target; today’s pending-execution path does not yet store principals — see ADR 0013 gap note).
6. **TerminalNeverLeaves** — `completed` / `failed` / `declined` / `expired` do not return to `pending` or `approved`.

## Today vs target

Production store (`packages/clawql-api/src/pending/`) requires `status === "approved"` and hash match at execute, but **does not atomically consume** before the side effect (`markCompleted` runs after). Concurrent resume / direct execute with the same `approvedExecutionId` can race. The TLA+ action `ExecuteApproved` in this spec **consumes in the same step** as the side effect (`approved` → `completed`). That is the **target** machine.

To explore the bug class, set `WeakConsume <- TRUE` in the `.cfg` (see comments in the `.tla`). TLC should then find a violation of `AtMostOneSideEffect` under two replicas.

## Run TLC

```bash
# With tla2tools.jar on CLASSPATH / Toolbox "Model checking"
java -XX:+UseParallelGC -jar tla2tools.jar \
  -config MandateLifecycle.cfg \
  MandateLifecycle.tla
```

Expect: with `WeakConsume <- FALSE` (default), TLC reports no errors on the small model. With `WeakConsume <- TRUE`, a counterexample for double execute.

## Mapping to code

| Spec | Code |
| --- | --- |
| `Park` | `PendingExecutionService.park` |
| `Approve` / `Decline` | `decide` |
| `ExecuteApproved` | `execute` + `approvedExecutionId` + `MandateArgsMatch` |
| `MarkDone` | `markCompleted` (target folds into ExecuteApproved) |
| Digests | `hashPendingArgsEffect` / `args-hash.ts` |
