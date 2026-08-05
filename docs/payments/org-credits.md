# Enterprise org credits (closed-loop company budgets)

**Status:** Tier-1 scaffold  
**Package:** `clawql-payments`  
**Module:** [`packages/clawql-payments/src/credits/org.ts`](../../packages/clawql-payments/src/credits/org.ts)  
**Store:** `$CLAWQL_HOME/Payments/org-credits.json`  
**Ledger:** existing `credits-ledger.json` (pool + member accounts)

## Why this exists

Companies need to budget ClawQL usage across employees without turning ClawQL into a consumer payments network.

| Pattern                                                       | Allowed on managed hosting?                          |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| Stripe bills the company for ClawQL                           | Yes                                                  |
| Company credit **pool** funded from the subscription / top-up | Yes (closed-loop)                                    |
| Role budgets (intern $10 / employee $20 / senior $50)         | Yes                                                  |
| CFO tops up an individual from the pool                       | Yes                                                  |
| Employee ↔ employee transfer **inside the same company org**  | Yes                                                  |
| Transfer to another company / public Venmo-like P2P           | **No** on managed (`CLAWQL_CREDITS_P2P_ENABLED` off) |

Credits are redeemable **only for ClawQL services**. They are not cash, not FDIC insured, and never leave the platform as money.

See [hosted vs self-hosted compliance](./hosted-vs-self-hosted-compliance.md).

## Roles

| Org role                    | Capabilities                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `billing_admin` (CFO/owner) | Fund pool (via Stripe top-up to pool tenant), set role policies, allocate to members, run period distribute, view all |
| `manager`                   | (Future) view team usage; may transfer from own balance to reports                                                    |
| `member`                    | Spend credits; transfer to colleagues **in the same org**                                                             |

Allocation roles (budget family): `intern` | `employee` | `senior` | `staff` | custom — set `defaultGrantCents` per policy.

## Model

```
Tenant credit pool (org:{orgId}:pool)  ← Stripe / plan top-up
  └─ Role policies (CFO sets: intern 1000¢, employee 2000¢, senior 5000¢)
       └─ Member CreditAccount (existing ledger tenantId)
            └─ Within-org peer transfers
            └─ DeductionService debits member balance on inference
```

Period end policy (default **`expire_to_pool`**): unused member balances return to the company pool before the next role grant. Alternative: `rollover` (leaves balances; simpler UX, more liability).

## API sketch

```ts
createOrg({ orgId, billingAdminTenantId, rolePolicies? })
setOrgRolePolicies(orgId, [{ roleId: "intern", defaultGrantCents: 1000 }, …])
addOrgMember({ orgId, memberTenantId, allocationRoleId, actorTenantId })
allocateFromPoolToMember({ orgId, toMemberTenantId, amountCents, actorTenantId })
transferWithinOrg({ orgId, fromMemberTenantId, toMemberTenantId, amountCents })
distributeOrgPeriod({ orgId, actorTenantId })  // recall (optional) + role grants
```

Flags:

| Env                                   | Default                | Meaning                                           |
| ------------------------------------- | ---------------------- | ------------------------------------------------- |
| `CLAWQL_CREDITS_ENABLED`              | off                    | Master credits switch                             |
| `CLAWQL_CREDITS_ORG_TRANSFER_ENABLED` | **on** when credits on | Within-org allocate/transfer (managed OK)         |
| `CLAWQL_CREDITS_P2P_ENABLED`          | off                    | Cross-tenant Venmo-like (blocked on managed)      |
| `CLAWQL_MANAGED_HOSTING`              | off                    | Forces general P2P off; org credits still allowed |

## Inference spend

`DeductionService` continues to debit the **member** `tenantId`. Hierarchy for later (not required for v1): member balance → org pool fallthrough → overage invoice to billing admin.

## Related

- [`credits-ach.md`](./credits-ach.md) — funding the pool via Stripe FC/ACH
- [`deduction-service.md`](./deduction-service.md) — spend path
- [`p2p-consumer-roadmap.md`](./p2p-consumer-roadmap.md) — cross-tenant P2P (self-hosted only)
