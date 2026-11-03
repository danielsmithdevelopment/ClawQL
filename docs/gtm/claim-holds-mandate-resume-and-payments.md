# Claim holds — mandate resume + payments (2026-11-03)

**Status:** Hold public copy until green evidence below is published.

## 1. Single-use approvals / “approval works once, then it's spent”

**Why held:** Native MCP resume with `approvedExecutionId` previously **skipped**
`tryConsumeApprovedMandate` and allowed the handler through. Approving once and
resuming twice (serial or concurrent) could run the action more than once —
undercutting the published single-use claim (explainer video + Cost Plus demo).

**Fix (this change):** `gateNativeToolBeforeInvoke` atomically consumes before
allow; wrap/govern finalize after the handler. Regression:
`native-tool-gate-resume.test.ts`. TLA+: `ResumeById` / `WeakResumeById` in
`MandateLifecycle.tla`.

**Hold until:** CI green on that test + mandate TLC; then refresh video/demo copy
only if the claim still matches the shipped path (catalog **and** native).

## 2. Payments “same patient approval” / crash-safety from the 1,000-crash board

**Why held:** `clawql-payments` money writes are **PARTIAL** on mandate and **NO**
on the program write-intent journal (see
[`docs/payments/crash-safety-coverage.md`](../payments/crash-safety-coverage.md)).
They do not inherit mandate single-use consume or the durability board’s journal
resume evidence.

**Keep out of public copy until** either:

- payment writes route through mandate consume + write-intent journal, **or**
- payments have their own measured crash/idempotency board and formal model
  coverage (holds/compensation TLA started; ACP/money-request still open).

Also do **not** claim Cost Plus follow-up “payments bound to the same patient
approval” until the routing or evidence exists.

## 3. Stripe idempotency write-ahead (open finding)

Checked ACP + ACH top-up paths:

| Path | Idempotency key durable **before** Stripe call? |
| ---- | ----------------------------------------------- |
| `AcpCheckoutService.completeSession` | **No** — `paymentIntents.create` has no `idempotencyKey`; session marked `completed` **after** PI create |
| `AchTopupService` live PI | **No** — creates PI, then `appendEntry(topup_pending)` with `paymentIntentId` |

Same class of bug as lost write-intent: crash between provider call and durable
record can double-charge on retry. Treat as a **payments cluster fix** before
any cash-rail crash-safety claim.

## Queue after this hold clears

1. celld lease/supersede (PR #1456 vendor lab)
2. OAuth/PKCE + HTTP session IFC labels (accumulate only)
3. Account deletion vs WORM
4. Program proposal graph
