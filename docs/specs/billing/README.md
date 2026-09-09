# Billing specs

| Spec                                                                       | Package / home                                   | Notes                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| [customer-provisioning-core-v0.1.md](./customer-provisioning-core-v0.1.md) | `clawql-payments` + thin `clawql-auth` key issue | One org model; `provisionOrg`; dual triggers  |
| [hybrid-billing-v0.1.md](./hybrid-billing-v0.1.md)                         | `clawql-payments` Stripe + credits ledger        | Subscription tiers + prepaid credits + hybrid |

**Operator guides:** [customer-provisioning-core.md](../../payments/customer-provisioning-core.md) · [stripe-products-ops.md](../../payments/stripe-products-ops.md)

**Related:** [org-credits](../../payments/org-credits.md) · [clawql-payments](../../payments/clawql-payments.md) · [spend-governance (outbound only)](../spend/spend-governance-v0.1.md) · [control-plane](../../enterprise/control-plane.md)
