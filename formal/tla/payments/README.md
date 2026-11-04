# Payments Stripe write-ahead (TLA+)

Model-checks Stripe PaymentIntent create with a durable idempotency key —
the recovery pattern used by ACP checkout complete and ACH credit top-up.

MandateLifecycle + ProgramResume crash-safety evidence does **not** cover
these cash rails (they bypass PendingExecution / write-intent journal). See
[`docs/payments/crash-safety-coverage.md`](../../../docs/payments/crash-safety-coverage.md).

Credit-hold + compensation 2PC formalization lives alongside this module when
merged from the payments-hold formal PR (`PaymentsHoldCompensation.*`).

## Files

| File | Role |
| ---- | ---- |
| `PaymentsStripeIdempotency.tla` | Spec — write-ahead key, Stripe create, retry, post-TTL metadata recover |
| `PaymentsStripeIdempotency.cfg` | TLC — **atomic** (`WeakWriteAhead = FALSE`); must pass |
| `PaymentsStripeIdempotencyWeak.cfg` | TLC — create without prior key; must fail `AtMostOneCharge` |

## Recovery model (code + spec)

1. Persist durable idempotency key (checkout session id / top-up `correlationId`)
2. Call Stripe with that key as `Idempotency-Key`
3. Record the PaymentIntent id
4. Retries reuse the same key (Stripe returns the original PI within ~24h)
5. After ~24h, look up by metadata before any new create (check-then-decide)

**Invariant:** `AtMostOneCharge` — a crash between the Stripe call and the local
record never leads to a second charge.

## Mapping to code

| Spec | Code |
| ---- | ---- |
| `WriteKey` | ACP session `stripe_idempotency_*` / `ensureAchTopupIntent` |
| `StripeCreateAtomic` / `StripeRetrySameKey` | `paymentIntents.create(..., { idempotencyKey })` |
| `ExpireKey` + `MetadataRecover` | `stripeIdempotencyKeyLikelyExpired` + `findPaymentIntentByMetadata` |
| `RecordPi` | session `payment_intent_id` / `attachAchTopupPaymentIntentId` |
| `WeakStripeCreate` | pre-fix create-before-durable-key (counterexample oracle) |

Helpers: `packages/clawql-payments/src/stripe/stripe-idempotency.ts`.

## Run TLC

```bash
./scripts/formal/run-payments-stripe-tlc.sh
```

Expect: atomic config exit 0; weak config exit ≠ 0 with `Safety` / `AtMostOneCharge`
violated.
