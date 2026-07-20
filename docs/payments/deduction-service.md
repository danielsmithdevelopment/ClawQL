# Sync DeductionService (counter + ledger + post-commit events)

**Status:** Tier-2 (July 2026)  
**Package:** `clawql-payments`  
**Consumers:** inference entitlement path (`EntitlementEnforcementService`)

## Thesis

AI / agent billing is **quota-based**: every request needs a **synchronous access decision** before tokens are spent. Async “tally events onto next month’s invoice” is not enough when five sub-agents can race the same balance.

ClawQL therefore separates:

1. **Counter** — spendable balance (grant buckets) used for allow/deny
2. **Ledger** — durable, auditable record of holds/captures/debits
3. **Event bus** — outbox (+ optional NATS) **after** the mutation commits

NATS never authorizes spend. Deduction mutates the counter first; the bus fans out to analytics/WORM consumers.

## Effect services

| Service             | Role                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `DeductionService`  | `hold` / `capture` / `release` / `debit` / `getSpendableBalance`             |
| `DeductionEventBus` | Append `$CLAWQL_HOME/Payments/deduction-outbox.jsonl`, optional NATS publish |
| `CreditsService`    | Balance queries + simple debit; ACH top-ups settle into **grant** rows       |

Wired in `paymentsServicesLiveLayer()`.

## Hot-path order (inference)

```text
plan entitlement check (optional)
  → DeductionService.hold (sync, idempotent key)
  → gateway.complete
  → on success: capture + usage increment (+ Stripe meter)
  → on failure: release hold
  → DeductionEventBus publish (outbox / NATS) after each mutation
```

Flags:

| Env                                   | Meaning                                                     |
| ------------------------------------- | ----------------------------------------------------------- |
| `CLAWQL_CREDITS_ENABLED=1`            | Enable ledger                                               |
| `CLAWQL_CREDITS_ENFORCE_INFERENCE`    | Sync hold on inference (default on when credits enabled)    |
| `CLAWQL_CREDITS_INFERENCE_COST_CENTS` | Hold amount per completion (default `1`)                    |
| `CLAWQL_NATS_URL` + publish flags     | Best-effort NATS after outbox (`CLAWQL_NATS_ENABLE_PUBLISH`, `CLAWQL_NATS_JETSTREAM`; subject `CLAWQL_NATS_SUBJECT_PAYMENTS` / `clawql.payments.credits.*`) |

## Grant waterfall

Balances are **rows** (grants), not a single column: `promo` → `plan` → `topup` → `rollover` / `adjust`, with **earliest expiry first**. Top-ups settle as `source: topup` grants.

## Holds (lock-and-release)

- **hold** — waterfall-deduct immediately (prevents concurrent overspend)
- **capture** — finalize; refund unused estimate back onto grant allocations
- **release** — full refund (failed / cancelled work)
- **idempotencyKey** — safe retries (`inference:<tenant>:<correlationId>`)

Per-tenant in-process lock serializes mutations (stage-appropriate). Multi-node Valkey Lua counters remain a scale-out layer on the same API.

## Scale-out (not in this tier)

- Valkey/Redis Lua `DECR` as the hot counter with batch sync to Postgres
- Partition by tenant/team (no global swarm counter)
- ClickHouse (or similar) as another consumer of the same outbox/NATS stream

What stays constant: **fast counter decides access; durable ledger proves usage; events follow the commit.**
