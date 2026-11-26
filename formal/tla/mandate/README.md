# Mandate lifecycle (TLA+)

Model-checks the pending-execution / mandate protocol:

`park → approve|decline|expire → consume → side effect → finalize`

with crash-after-consume leaving **`outcome_unknown`** (never silently retried).

**Claim to protect:** approved once, for this exact change (canonical args digest), never by the requester.

## Files

| File                               | Role                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| `MandateLifecycle.tla`             | Spec — states, actions, invariants                                   |
| `MandateLifecycle.cfg`             | TLC — **atomic** target (`WeakConsume = FALSE`); must pass           |
| `MandateLifecycleWeak.cfg`         | TLC — **legacy race** (`WeakConsume = TRUE`); must _fail_ Safety     |
| `BatchMandate.tla`                 | ADR 0015 — batch Merkle root approve + inclusion consume             |
| `BatchMandate.cfg`                 | TLC — Safety must pass (`./scripts/formal/run-batch-mandate-tlc.sh`) |
| `ApprovalChannel.tla`              | Spec — channel/kind/tier guards for mandate approve                  |
| `ApprovalChannel.cfg`              | TLC — target (both weak flags FALSE); must pass                      |
| `ApprovalChannelWeak.cfg`          | TLC — mcp approve enabled; must fail `NoAgentApproval`               |
| `ApprovalChannelWeakAgentCred.cfg` | TLC — agent key on operator/console; must fail `NoAgentApproval`     |
| `ApprovalChannelQuorum2.cfg`       | TLC — `Quorum = 2` with two humans; must pass Safety (G3)            |

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

| Spec                  | Code                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Park`                | `PendingExecutionService.park`                                                                                       |
| `Approve` / `Decline` | `decide`                                                                                                             |
| `TamperPendingDigest` | args change while pending (digest re-bind)                                                                           |
| `Consume`             | `tryConsumeApprovedEffect` / `tryConsumeApprovedMandate` (execute-core)                                              |
| `ResumeById`          | Native MCP resume: `gateNativeToolBeforeInvoke` + `tryConsumeApprovedMandate` before handler (`approvedExecutionId`) |
| `WeakResumeById`      | **Bug oracle** — allow resume without CAS (pre-fix native gate)                                                      |
| `SideEffect`          | execute / native handler body after consume                                                                          |
| `Finalize`            | `markCompleted` / `markPendingCompleted` after handler                                                               |
| Digests               | `hashPendingArgsEffect` / `args-hash.ts` (strip host-only `approvedExecutionId`)                                     |
| Idempotency           | `mandateIdempotencyKey(executionId)` for Stripe etc.                                                                 |

### Trace conformance (resume)

Native resume must appear in traces as **Consume/ResumeById → SideEffect → Finalize**, never
**approved → SideEffect** while status stays `approved`. Vitest:
`packages/clawql-api/src/governance/native-tool-gate-resume.test.ts` (serial + concurrent).

## Approval channel (resume-core)

Models the channel × tier guards that keep agents from self-approving and keep
regulated approves on the console path.

### Invariants

1. **NoAgentApproval** — no approval WORM entry has `kind = agent` or `channel = mcp`.
2. **RegulatedConsoleOnly** — under `regulated`, every approval came through `console`.
3. **HumanRecordIsHuman** — `HUMAN_APPROVAL` exists only for principal kind `human`
   (operator-key path records `OPERATOR_APPROVAL`, never human — audit #1548).
4. **ExecuteNeedsQuorum** — execution runs only after approvals meet quorum.

### Mapping to code

| Spec                            | Code                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `ApproveEnabled` (mcp)          | `resume-core.ts` — `channel === "mcp" && decision === "approve"` refuse           |
| `ApproveEnabled` (tier)         | `resume-core.ts` — regulated + approve + `channel !== "console"` refuse           |
| `ApproveCredentialOK`           | Y1/Z1 — agent credentials are mcp-scoped; operator/console is human/operator      |
| `Approve` / worm types          | `pending-execution-service.ts` decide + WORM append (`HUMAN_APPROVAL` / decline)  |
| `KindOf` / `OPERATOR_APPROVAL`  | Target ghost type for operator-key path (not logged as human)                     |
| `WeakMcpApprove`                | **Bug oracle** — same `Approve` action with mcp refuse relaxed (no bypass action) |
| `WeakAgentCredentialOnOperator` | **Bug oracle** — agent key accepted on operator/console (Y1/Z1)                   |
| `HumanRecordIsHuman`            | Target: operator key ≠ `HUMAN_APPROVAL` (audit #1548)                             |

```bash
./scripts/formal/run-approval-channel-tlc.sh
```

Expect: atomic + Quorum2 configs print `No error has been found`; both weak configs
report `Invariant NoAgentApproval is violated` via `scripts/formal/lib/expect-violation.sh`
(a parse/config error alone must not pass).

## Audit hunt (production)

Search WORM for any mandate with **two** `MANDATE_CONSUMED` (or two successful executes) for the same `executionId`:

```bash
node scripts/formal/audit-mandate-double-execute.mjs --help
```
