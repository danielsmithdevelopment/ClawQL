# Payments hold + compensation (TLA+)

Model-checks the **credit-hold** and **compensation HITL 2PC** protocols that
live in `clawql-payments` — independent of mandate consume and the program
write-intent journal.

## Coverage finding (critical)

| Path | Covers payments money writes? |
| ---- | ----------------------------- |
| Mandate / `PendingExecution` | **PARTIAL** — unknown native MCP tools default to `destructive` and may *park* for approval, but resume skips `tryConsumeApprovedMandate` (`native-tool-gate.ts`). Direct Effect services / HTTP / Stripe / ACP bypass PendingExecution entirely. |
| Program journal / write-intent | **NO** — durable intents only wrap catalog `execute` / program proposals. Payment MCP tools and ledger stores are not journaled. |
| AP2 "mandate" JWT | Orthogonal auth check — not `pex_…` pending-execution. |

**Implication:** MandateLifecycle + ProgramResume crash-safety evidence does **not**
cover agentic payments. Orphaned `held` rows and double-capture races are owned
by the ledger lock + idempotency keys (and this model), not by `outcome_unknown`
redrive.

## Files

| File | Role |
| ---- | ---- |
| `PaymentsHoldCompensation.tla` | Spec — holds + compensation actions, crash/retry |
| `PaymentsHoldCompensation.cfg` | TLC — **atomic** target (`WeakAtomicity = FALSE`); must pass |
| `PaymentsHoldCompensationWeak.cfg` | TLC — **legacy race** (`WeakAtomicity = TRUE`); must fail Safety |

## Invariants (target)

1. **AtMostOneCapture** — a hold id is never successfully captured more than once.
2. **AtMostOneRelease** — same for release.
3. **HoldExclusiveSettle** — never both a capture and a release effect on one hold.
4. **AtMostOneCompensationExecute** — confirm/execute side effect (bounty, transfer) runs at most once.

## Mapping to code

| Spec | Code |
| ---- | ---- |
| `HoldCreate` | `holdCreditsImpl` / `CreditsService` / `DeductionService.hold` |
| `CaptureAtomic` / `CaptureIdempotent` | `captureHoldImpl` + `transitionCreditHold` |
| `ReleaseAtomic` / `ReleaseIdempotent` | `releaseHoldImpl` + `transitionCreditHold` |
| `StageAction` | `stagePendingAction` |
| `ConfirmAtomic` / `ConfirmIdempotent` | compensation confirm (short-circuit on `executed`) + `transitionPendingAction` |
| `CancelAtomic` / `ExpireAtomic` | cancel / `materializeExpiry` |
| Weak\* | historical non-atomic status write after side effect (counterexample oracle) |

## Explicit transition functions (TypeScript)

Scattered `if (status === …)` guards are being collapsed into:

- `packages/clawql-payments/src/credits/hold-transition.ts`
- `packages/clawql-payments/src/compensation/pending-action-transition.ts`

Pure `(state, event) → next | IllegalTransition` with exhaustive matching in Effect —
one place to log transitions for conformance against this TLA+ model.

## Run TLC

```bash
./scripts/formal/run-payments-hold-tlc.sh
```

Expect: atomic config exit 0; weak config exit ≠ 0 with `Safety` / `AtMostOneCapture`
or `AtMostOneCompensationExecute` violated.

## Next (same cluster, not yet in this module)

- Money-request status graph (`pending` → `accepted` → `paid` / …)
- ACP checkout (`ready_for_payment` → `completed` | `canceled`) + Stripe PI idempotency
- Account deletion vs WORM retention
- Multi-node ledger lock (today: in-process per-tenant; Valkey called out as future)
