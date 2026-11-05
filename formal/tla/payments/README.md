# Payments formal models (TLA+)

Two specs for `clawql-payments` money paths that are **not** covered by mandate
consume or the program write-intent journal. See
[`docs/payments/crash-safety-coverage.md`](../../../docs/payments/crash-safety-coverage.md).

| Spec                          | Role                                                |
| ----------------------------- | --------------------------------------------------- |
| `PaymentsHoldCompensation.*`  | Credit holds + compensation HITL 2PC                |
| `PaymentsStripeIdempotency.*` | Stripe PI write-ahead idempotency (ACP / ACH / MPP) |
| `MoneyRequestStatus.*`        | Money-request / invoice status graph                |

## Coverage finding (critical)

| Path                           | Covers payments money writes?                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Mandate / `PendingExecution`   | **PARTIAL** — native resume now CAS-consumes (#1459); direct Effect / HTTP / Stripe / ACP still bypass PendingExecution |
| Program journal / write-intent | **NO** — durable intents only wrap catalog `execute` / program proposals                                                |
| AP2 "mandate" JWT              | Orthogonal auth — not `pex_…` pending-execution                                                                         |

**Implication:** MandateLifecycle + ProgramResume crash-safety evidence does **not**
underwrite agentic-payments claims. Orphaned `held` rows, double-capture, and
Stripe double-charge races are owned by ledger locks, explicit transitions, and
these models.

---

## Hold + compensation

| File                               | Role                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| `PaymentsHoldCompensation.tla`     | Spec — holds + compensation actions, crash/retry                 |
| `PaymentsHoldCompensation.cfg`     | TLC — **atomic** (`WeakAtomicity = FALSE`); must pass            |
| `PaymentsHoldCompensationWeak.cfg` | TLC — **legacy race** (`WeakAtomicity = TRUE`); must fail Safety |

### Invariants

1. **AtMostOneCapture** — a hold id is never successfully captured more than once.
2. **AtMostOneRelease** — same for release.
3. **HoldExclusiveSettle** — never both a capture and a release effect on one hold.
4. **AtMostOneCompensationExecute** — confirm/execute side effect runs at most once.

### Mapping to code

| Spec                                  | Code                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `HoldCreate`                          | `holdCreditsImpl` / `CreditsService` / `DeductionService.hold`               |
| `CaptureAtomic` / `CaptureIdempotent` | `captureHoldImpl` + `transitionCreditHold`                                   |
| `ReleaseAtomic` / `ReleaseIdempotent` | `releaseHoldImpl` + `transitionCreditHold`                                   |
| `StageAction`                         | `stagePendingAction`                                                         |
| `ConfirmAtomic` / `ConfirmIdempotent` | compensation confirm + `transitionPendingAction`                             |
| `CancelAtomic` / `ExpireAtomic`       | cancel / `materializeExpiry`                                                 |
| Weak\*                                | historical non-atomic status write after side effect (counterexample oracle) |

Explicit transitions:

- `packages/clawql-payments/src/credits/hold-transition.ts`
- `packages/clawql-payments/src/compensation/pending-action-transition.ts`

```bash
./scripts/formal/run-payments-hold-tlc.sh
```

---

## Stripe write-ahead

| File                                | Role                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `PaymentsStripeIdempotency.tla`     | Spec — write-ahead key, Stripe create, retry, post-TTL metadata recover |
| `PaymentsStripeIdempotency.cfg`     | TLC — **atomic** (`WeakWriteAhead = FALSE`); must pass                  |
| `PaymentsStripeIdempotencyWeak.cfg` | TLC — create without prior key; must fail `AtMostOneCharge`             |

### Recovery model

1. Persist durable idempotency key (checkout session / top-up / MPP challenge id)
2. Call Stripe with that key as `Idempotency-Key`
3. Record the PaymentIntent id
4. Retries reuse the same key (within ~24h)
5. After ~24h, metadata lookup; **fail closed** if Search is unavailable

**Invariant:** `AtMostOneCharge` — a crash between the Stripe call and the local
record never leads to a second charge.

```bash
./scripts/formal/run-payments-stripe-tlc.sh
```

Helpers: `packages/clawql-payments/src/stripe/stripe-idempotency.ts`.

---

## Money-request status

| File                         | Role                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `MoneyRequestStatus.tla`     | Spec — pending → accepted → paid; decline/cancel/expire |
| `MoneyRequestStatus.cfg`     | Target (`WeakSkipAccept = FALSE`); must pass            |
| `MoneyRequestStatusWeak.cfg` | Pay without accept; must fail `PaidImpliesAccepted`     |

```bash
./scripts/formal/run-money-request-tlc.sh
```

Code: `money-request-transition.ts` wired into `requests.ts` (`markAccepted` /
`markPaid` / decline / cancel / expire).

## Next (same cluster)

- ACP checkout status graph beyond Stripe PI create
- Multi-node ledger lock (today: in-process per-tenant; Valkey called out as future)
