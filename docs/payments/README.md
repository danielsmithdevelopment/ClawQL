# Payments documentation

ClawQL's unified billing layer — **Stripe** (human fiat), **x402** (per-request USDC), **MPP** (session micropayments), **AP2** (Payment Mandates), **ACP** (agentic checkout), **PayPal** Orders, **Adyen** Checkout (enterprise), managed plan entitlements, and **WORM-auditable** payment events.

| Doc                                                                                      | Audience                             | Contents                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [**clawql-payments.md**](clawql-payments.md)                                             | Operators, integrators, contributors | Architecture, setup, env vars, HTTP flows, CLI, Tier 3 roadmap (Mollie/Razorpay), inference integration |
| [**accounting-and-tax.md**](accounting-and-tax.md)                                       | Finance / ops / CPA handoff          | Subledger export, CoA map, tax profile gate, year-end evidence (1099 / VAT / W-9 ownership)             |
| [**credits-ach.md**](credits-ach.md)                                                     | Prepaid balance operators            | Credits ledger, Stripe Financial Connections / ACH top-up, WORM events                                  |
| [**deduction-service.md**](deduction-service.md)                                         | Inference / metering operators       | Sync hold/capture on the request path; post-commit NATS / outbox                                        |
| [**payouts-ramp.md**](payouts-ramp.md)                                                   | Platforms paying creators / agents   | Stripe Connect, Base USDC, Ramp agent cards, Moonpay/Transak off-ramp                                   |
| [**agent-compensation.md**](agent-compensation.md)                                       | SGDOP / swarm operators              | Agent credits ledger, DAOS 2PC staging, cash-out via PayoutService                                      |
| [**sgdop-coordinator-compensation-bridge.md**](sgdop-coordinator-compensation-bridge.md) | Coordinator / DAOS integrators       | Stage-only `CompensationStagingPort` — Coordinator never confirms                                       |

## Package and CLI entry points

- **Package:** [`packages/clawql-payments`](../../packages/clawql-payments)
- **CLI:** `clawql payments *` → [`src/onboarding/payments-cli.ts`](../../src/onboarding/payments-cli.ts)
- **Inference integration:** [`packages/clawql-inference`](../../packages/clawql-inference) — plan limits, x402 middleware, optional MPP challenges
- **Plugin:** [`docs/plugins/payments.md`](../plugins/payments.md) → `/plugins/payments`

## Related docs

- [clawql-inference](../inference/clawql-inference.md) — gateway, call store, export/finetune flywheel
- [clawql-idp-platform](../vision/clawql-idp-platform.md) — product pricing philosophy
- [**accounting-and-tax.md**](accounting-and-tax.md) — WORM → books handoff; tax form ownership
- GitHub [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88) — `.well-known/payments.json` discovery (dynamic on self-hosted HTTP; static on docs site)
