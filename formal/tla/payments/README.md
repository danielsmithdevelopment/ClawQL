# Payments formal models (TLA+)

Two specs for `clawql-payments` money paths that are **not** covered by mandate
consume or the program write-intent journal. See
[`docs/payments/crash-safety-coverage.md`](../../../docs/payments/crash-safety-coverage.md).

| Spec                          | Role                                                |
| ----------------------------- | --------------------------------------------------- |
| `PaymentsHoldCompensation.*`  | Credit holds + compensation HITL 2PC                |
| `PaymentsStripeIdempotency.*` | Stripe PI write-ahead idempotency (ACP / ACH / MPP) |
| `MoneyRequestStatus.*`        | Money-request / invoice status graph                |
| `AcpCheckoutStatus.*`         | ACP checkout session status graph                   |
| `PaymentsLedgerLock.*`        | Multi-node tenant ledger lock + fencing             |
| `X402Settlement.*`            | x402 settle-before-allow + facilitator at-most-once |

## x402 settle-before-allow

| File                                     | Role                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `X402Settlement.tla`                     | Spec — two replicas, per-process replay cache, facilitator settle    |
| `X402Settlement.cfg`                     | TLC — target (both weak flags FALSE); must pass                      |
| `X402SettlementWeakSkipSettle.cfg`       | TLC — allow after verify without settle; must fail `AllowImpliesSettled` |
| `X402SettlementWeakDoubleSettle.cfg`     | TLC — facilitator accepts second settle; must fail `AllowAtMostOnce` |

### Invariants

1. **AllowImpliesSettled** — every allowed request has a successful settle.
2. **AllowAtMostOnce** — each proof is allowed at most once across all replicas.
3. **ReceivedAfterSettle** — `X402_PAYMENT_RECEIVED` only after settle.

**Claim caveat:** with per-replica caches and a check-then-remember gap,
`AllowAtMostOnce` holds only because the facilitator refuses a second settle of
the same authorization nonce. The weak double-settle config makes that
dependency explicit — do not treat the in-process replay cache as the
cross-replica guarantee. Prefer "at most once", never "exactly once".

### Mapping to code

| Spec                         | Code                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `StartRequest` / `inflight`  | `replay.seen` check before settle (gap before `remember`)            |
| `SettleAllow` / `cache`      | `facilitator.settle` then `replay.remember` then allow               |
| `ReplayDeny` / `cache`       | `replay-cache.ts` `seen` / `remember` (module singleton, max 10_000) |
| `received`                   | reconcile writes `X402_PAYMENT_RECEIVED` only when `txHash` present   |
| `WeakSkipSettle`             | `settle: false` path (refused under `CLAWQL_TIER=regulated`)         |
| `WeakFacilitatorDoubleSettle`| Facilitator that accepts a second settle of the same nonce           |

```bash
./scripts/formal/run-x402-settlement-tlc.sh
```

Expect: atomic exit 0; both weak configs exit ≠ 0.

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

## ACP checkout status

| File | Role |
| ---- | ---- |
| `AcpCheckoutStatus.tla` | Spec — ready → completed; cancel; make-ready |
| `AcpCheckoutStatus.cfg` | Target (`WeakCompleteNotReady = FALSE`); must pass |
| `AcpCheckoutStatusWeak.cfg` | Complete from not_ready; must fail `CompleteOnlyWhenReady` |

```bash
./scripts/formal/run-acp-checkout-tlc.sh
```

Code: `acp-checkout-transition.ts` wired into `acp-checkout-service.ts`
(`createSession` / `completeSession`). Stripe PI write-ahead remains
`PaymentsStripeIdempotency.*`.

## Multi-node ledger lock

| File | Role |
| ---- | ---- |
| `PaymentsLedgerLock.tla` | Spec — SET NX acquire, fenced CS, compare-and-delete release |
| `PaymentsLedgerLock.cfg` | Target (`WeakNoFence = FALSE`); must pass |
| `PaymentsLedgerLockWeak.cfg` | Overwrite acquire / unfenced release; must fail `AtMostOneInCS` |

```bash
./scripts/formal/run-payments-ledger-lock-tlc.sh
```

Code: `ledger-lock.ts` — Valkey/Redis URL → Postgres advisory → in-process.
Env: `CLAWQL_PAYMENTS_LEDGER_LOCK_URL` / `CLAWQL_VALKEY_URL` / `CLAWQL_REDIS_URL`.

## Next (same cluster)

- Valkey Lua hot counters for deduction (beyond mutex); celld lab soak still off-main
