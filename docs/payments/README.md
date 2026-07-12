# Payments documentation

ClawQL's unified billing layer — Stripe subscriptions, x402 micropayments, managed plan entitlements, and WORM-auditable payment events.

| Doc                                          | Audience                             | Contents                                                                                         |
| -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [**clawql-payments.md**](clawql-payments.md) | Operators, integrators, contributors | Architecture, setup, env vars, HTTP flows, CLI reference, inference integration, troubleshooting |

## Package and CLI entry points

- **Package:** [`packages/clawql-payments`](../../packages/clawql-payments)
- **CLI:** `clawql payments *` → [`src/onboarding/payments-cli.ts`](../../src/onboarding/payments-cli.ts)
- **Inference integration:** [`packages/clawql-inference`](../../packages/clawql-inference) — plan limits and x402 middleware

## Related docs

- [clawql-inference](../inference/clawql-inference.md) — gateway, call store, export/finetune flywheel
- [clawql-idp-platform](../vision/clawql-idp-platform.md) — product pricing philosophy
- GitHub [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88) — `.well-known/payments.json` discovery (dynamic on self-hosted HTTP; static on docs site)
