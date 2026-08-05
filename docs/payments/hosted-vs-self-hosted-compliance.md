# Hosted vs self-hosted payments — compliance posture

**Not legal advice.** ClawQL is not a bank or licensed money transmitter. This document describes how the product is **intended to be operated** so marketing and managed hosting stay aligned with a Stripe-mediated SaaS model.

## Managed / hosted ClawQL (clawql.com SaaS)

| Allowed | Not offered on managed |
| --- | --- |
| Stripe subscriptions, invoices, and platform fees for ClawQL plans | Tenant↔tenant prepaid **P2P** (Venmo-like) transfers |
| Stripe-mediated billing for your usage of ClawQL | Agent compensation deposit / cash-out ledgers between agents |
| Optional **closed-loop** prepaid credits redeemable only for ClawQL inference / gateway / IDP services (when `CLAWQL_CREDITS_ENABLED=1`) | General-purpose peer payments or cash float held as ClawQL balances for arbitrary P2P |

Set `CLAWQL_MANAGED_HOSTING=1` (aliases: `CLAWQL_HOSTED_MODE`, `CLAWQL_GATEWAY_MANAGED`) on managed fleets. That **forces off** P2P and agent compensation even if other flags are set.

## Self-hosted operators

The full `clawql-payments` stack—including P2P stage/confirm, money requests, and agent compensation—ships in the open-source package for operators who run ClawQL in **their** environment under **their** compliance program (e.g. a regulated fintech with counsel).

Opt in explicitly:

```bash
export CLAWQL_CREDITS_ENABLED=1
export CLAWQL_CREDITS_P2P_ENABLED=1          # peer transfer / accept money request
export CLAWQL_COMPENSATION_ENABLED=1        # agent deposit / cash-out
```

Defaults: **P2P off**, **compensation off**. Enabling them is an operator decision; ClawQL does not provide money-transmitter licensing for your deployment.

## Product framing (docs + website)

Use this language:

> ClawQL ships a full payments stack. **Managed hosting** uses Stripe-mediated fiat (and optional agentic rails for **platform fees** and gated tool access). **Peer credit transfer and agent compensation** are available to **self-hosted** operators who operate within their own compliance framework.

Avoid claiming ClawQL is a consumer payments network, FDIC-insured balances, or a licensed money transmitter.

## Credits are not bank deposits

Prepaid credits (when enabled) are software ledger entries for ClawQL services or, on self-hosted with P2P enabled, internal peer transfers. They are **not** FDIC insured and are **not** a bank account.

## Related

- [`clawql-payments.md`](./clawql-payments.md) — architecture and setup
- [`p2p-consumer-roadmap.md`](./p2p-consumer-roadmap.md) — self-hosted P2P UX
- [`agent-compensation.md`](./agent-compensation.md) — self-hosted agent rails
- [`credits-ach.md`](./credits-ach.md) — closed-loop top-up for service usage
