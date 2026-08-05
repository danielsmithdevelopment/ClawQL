# Prepaid credits + bank top-up (Stripe Financial Connections / ACH)

**Status:** Tier-1 scaffold (July 2026)  
**Package:** `clawql-payments`  
**CLI:** `clawql payments credits *`

## Goal

Let users **connect a bank account**, **top up prepaid credit balances**, and **transfer credits peer-to-peer** between ClawQL tenants. Balances can be debited for inference/docs usage (alongside plan entitlements). Withdrawals use existing payout / off-ramp rails; this doc covers the prepaid ledger + ACH top-up + P2P transfer.

## Why not a raw Plaid SDK?

ClawQL already runs on **Stripe**. Bank linking is implemented with **[Stripe Financial Connections](https://docs.stripe.com/financial-connections/payments)** + **`us_bank_account` ACH PaymentIntents**.

Stripe’s Link / Financial Connections UI commonly uses **Plaid (and other aggregators) under the hood**. That gives users a familiar bank-connect experience without a second identity, webhook, or compliance surface in ClawQL.

Use a direct Plaid integration only if you need non-payment Plaid products (Identity, Assets, Transactions analytics) outside Stripe.

## Flow

```mermaid
sequenceDiagram
  participant User
  participant CLI as clawql payments credits
  participant Stripe
  participant Ledger as credits-ledger.json
  participant WORM as payment audit

  User->>CLI: bank-link --customer cus_…
  CLI->>Stripe: financialConnections.sessions.create
  Stripe-->>User: Link UI (Plaid-backed)
  User->>Stripe: authorize bank → pm_…
  User->>CLI: topup --amount 25 --payment-method pm_…
  CLI->>Stripe: PaymentIntent us_bank_account
  CLI->>Ledger: topup_pending
  CLI->>WORM: CREDIT_TOPUP_PENDING
  Stripe-->>CLI: webhook payment_intent.succeeded
  CLI->>Ledger: topup_settled (+balance)
  CLI->>WORM: CREDIT_TOPUP_SETTLED
```

ACH can take **1–3 business days**. Credits settle on `payment_intent.succeeded` (or immediately in dry-run).

## Feature flags

| Env                         | Default                               | Meaning                                                         |
| --------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `CLAWQL_CREDITS_ENABLED`    | off                                   | Enable prepaid credit ledger                                    |
| `CLAWQL_ACH_TOPUP_ENABLED`  | on when credits + `STRIPE_SECRET_KEY` | Enable FC + ACH top-up path                                     |
| `CLAWQL_ACH_TOPUP_DRY_RUN`  | off                                   | Create sessions / settle without live Stripe/ACH (tests, demos) |
| `CLAWQL_CREDITS_RETURN_URL` | —                                     | Optional return URL for Financial Connections                   |

## CLI

```bash
export CLAWQL_CREDITS_ENABLED=1
export CLAWQL_ACH_TOPUP_DRY_RUN=1   # local demo without Stripe

clawql payments credits show
clawql payments credits bank-link --customer cus_xxx
clawql payments credits topup --customer cus_xxx --amount 25
# live:
# clawql payments credits topup --customer cus_xxx --amount 25 --payment-method pm_xxx

# P2P: move prepaid credits to another ClawQL tenant
clawql payments credits transfer --to-tenant bob --amount 10
clawql payments credits transfer --from-tenant alice --to-tenant bob --amount 5 \
  --idempotency-key lunch-2026-08-05 --note "shared inference budget"
```

## Peer-to-peer transfers

`CreditsService.transfer` debits the sender and credits the recipient **atomically** (ordered tenant locks; shared `transferId` on both ledger legs).

| Property | Behavior |
| -------- | -------- |
| Scope | Tenant ↔ tenant prepaid credits (not Stripe Connect / USDC chain send) |
| Overdraft | Rejected — sender must have spendable grant balance |
| Idempotency | Optional `--idempotency-key` / `idempotencyKey` replays the same transfer |
| WORM | `CREDIT_TRANSFER_SENT` + `CREDIT_TRANSFER_RECEIVED` (accounting category `peer_transfer`) |
| MCP | `payments_credits_transfer` when `CLAWQL_PAYMENTS_MCP_TOOLS=1` (high-impact / financial) |

```mermaid
sequenceDiagram
  participant A as Tenant A
  participant CLI as credits transfer
  participant Ledger as credits-ledger.json
  participant WORM as payment audit

  A->>CLI: transfer --to-tenant B --amount 10
  CLI->>Ledger: lock A+B (sorted)
  CLI->>Ledger: transfer_out A / transfer_in B
  CLI->>WORM: CREDIT_TRANSFER_SENT + RECEIVED
  CLI-->>A: transferId + balances
```

Platform liability is unchanged (credits move between tenants). Withdraw to bank/USDC remains via [payouts / off-ramp](./payouts-ramp.md).

## Storage

- Ledger: `$CLAWQL_HOME/Payments/credits-ledger.json` (append-only entries, USD cents)
- WORM kinds: `BANK_LINKED`, `CREDIT_TOPUP_PENDING`, `CREDIT_TOPUP_SETTLED`, `CREDIT_TOPUP_FAILED`, `CREDIT_DEBITED`, `CREDIT_TRANSFER_SENT`, `CREDIT_TRANSFER_RECEIVED`

## Effect services

- `CreditsService` — balance / debit / settle / **transfer**
- `AchTopupService` — Financial Connections session + ACH top-up PaymentIntent

Wired into `paymentsServicesLiveLayer()`. Discovery advertises `type: "credits"` in `.well-known/payments.json` when enabled.

## Follow-ups

- Hosted checkout / Billing Portal bank payment method UX
- Optional direct Plaid Link only if product needs non-Stripe bank data
- Valkey Lua hot counter + Postgres durable grants (same DeductionService API)
- Directory / handle resolution (`@user` → tenant id) outside the ledger

Inference debit/hold is implemented via [`DeductionService`](./deduction-service.md) (`CLAWQL_CREDITS_ENFORCE_INFERENCE`).
