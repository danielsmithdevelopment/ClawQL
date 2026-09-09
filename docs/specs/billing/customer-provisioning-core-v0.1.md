# Customer Provisioning Core

**Status:** Spec v0.1 — implementation slice shipped (pieces 1–6); dashboard full scope (topology + embedded traces)  
**Primary package:** `clawql-payments` (org store, billing, ledger)  
**Auth edge:** `clawql-auth` API-key issue only (`IssuedApiKeyStore`)  
**Optional path note:** A thin `packages/clawql-auth/src/provisioning/` façade may re-export `provisionOrg` for hosts that already compose auth first — **storage and Stripe stay in payments**.  
**Related:** [hybrid billing](./hybrid-billing-v0.1.md) · [org-credits](../../payments/org-credits.md) · [spend-governance](../spend/spend-governance-v0.1.md) (outbound USDC only — do not conflate)

## Specification v0.1

---

## 1. Core principle

**Every customer is an org.** Self-serve signup creates an org with one member. Enterprise sales creates an org with N members up front. There is **no** separate “individual account” table and **no** later migration when a solo org grows — it already is an org, just small.

Org-of-1 and org-of-1000 share one data shape.

---

## 2. Locked decisions (hardened against the repo)

| Topic                               | Decision                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Org store**                       | Extend existing `$CLAWQL_HOME/Payments/org-credits.json` (`OrgRecord` / `OrgMembership`) — **do not** invent a second Org table in Postgres or auth                                                                                                                                          |
| **Roles**                           | Keep shipped `OrgMemberRole`: `billing_admin` \| `manager` \| `member`. Solo owner = sole member with `billing_admin` (can do everything; no second approver). Do **not** invent a parallel `SpendRole` / `spend_admin` for CPC — that name is reserved if spend-governance later grows RBAC |
| **Plan / tier id**                  | Use existing `ClawqlPlanId` (`free` \| `pro` \| `team` \| `enterprise`) from `clawql-payments` plans — map to Stripe Products/Prices and gateway tiers explicitly                                                                                                                            |
| **API keys**                        | Reuse `IssuedApiKeyStore.issue` with `subjectId` + optional `orgId` metadata. No `ownerType: 'org'` field today — org ownership is `orgId` on a subject-issued default key (or a dedicated service subject). Spec forbids inventing a second issuer                                          |
| **Credits ledger**                  | Reuse `CreditsLedgerService` / `CreditLedgerEntry` / `DeductionService` — **not** a new bare `CreditLedger` type                                                                                                                                                                             |
| **Stripe Checkout provision today** | Cloudflare gateway already handles `checkout.session.completed` → D1 tenant. Node CPC must **converge** on the same `provisionOrg` Effect (gateway calls shared logic or posts into payments), not fork a second provisioner                                                                 |
| **Effect**                          | `provisionOrg` / stores / Stripe wrappers are Effect `Context.Tag` + `Layer`; Express/MCP/webhook hosts stay thin Promise façades                                                                                                                                                            |

Spend-governance v0.1 remains **outbound USDC only**. CPC does not fold into that spec.

---

## 3. Data model (logical)

Build on shipped shapes; additive fields for CPC:

```typescript
/** Extends OrgRecord — same file/store. */
type OrgBillingFields = {
  createdVia: "self_serve" | "enterprise_sales";
  /**
   * How money settles with Stripe.
   * - stripe_checkout: self-serve Billing subscription (Checkout → Subscription)
   * - stripe_invoice: enterprise NET terms / manual invoice
   * - hybrid: subscription included quota + prepaid credits beyond / beside it
   * - credits_only: no recurring subscription; prepaid top-ups only
   */
  billingMode: "stripe_checkout" | "stripe_invoice" | "hybrid" | "credits_only";
  planId: ClawqlPlanId; // was optional on OrgRecord — required after provision
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

/**
 * Membership continues as OrgMembership.
 * Solo: one member, orgRole: "billing_admin".
 */
type OrgMemberView = {
  orgId: string;
  memberTenantId: string; // existing ledger tenant id
  orgRole: "billing_admin" | "manager" | "member";
  joinedAt: string;
};
```

No new role system. Allocation roles (`intern` / `employee` / …) stay as **budget families** inside the org pool (see org-credits).

---

## 4. The provisioning core — one Effect, two triggers

```typescript
type ProvisionOrgInput = {
  orgName: string;
  ownerEmail: string;
  planId: ClawqlPlanId;
  createdVia: "self_serve" | "enterprise_sales";
  billingMode: OrgBillingFields["billingMode"];
  /** Optional Stripe ids when webhook already created customer/subscription. */
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Enterprise: additional seats to invite at provision time. */
  additionalMemberEmails?: readonly string[];
};

type ProvisionOrgResult = {
  orgId: string;
  poolTenantId: string;
  ownerMemberTenantId: string;
  /** Raw default API key — shown once. */
  apiKey: string;
};
```

**Behavior (normative):**

1. Create / upsert `OrgRecord` with billing fields + `planId`.
2. Ensure pool tenant `org:{orgId}:pool` and owner member tenant exist on the credits ledger.
3. `addOrgMember` owner with `orgRole: "billing_admin"`.
4. For each `additionalMemberEmails` (enterprise), add members as `member` (or invite-pending — implementation may stage invites).
5. Issue default API key via `IssuedApiKeyStore.issue` with `orgId` set; scopes derived from `ClawqlPlanId` (tier → allowed tools / rate hints — product mapping in hybrid-billing).
6. Append WORM `ORG_PROVISIONED`.
7. Return `{ orgId, apiKey, … }` — raw key never written to WORM.

**Two triggers call the same function:**

| Trigger          | Who                                                                                   | Typical `billingMode`         |
| ---------------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| Self-serve       | Stripe `checkout.session.completed` (gateway today → must call shared `provisionOrg`) | `stripe_checkout` or `hybrid` |
| Enterprise       | Internal admin tool after deal close                                                  | `stripe_invoice` or `hybrid`  |
| Credits-only SKU | Checkout one-time top-up product without subscription                                 | `credits_only`                |

Nothing else forks provision logic.

---

## 5. Metering — read existing spend, don’t duplicate

```typescript
/** Thin Stripe-facing wrapper — aggregation stays in payments. */
reportUsageToStripe(orgId: string, period: DateRange): Effect<…>
```

- Prefer existing `getOrgUnifiedSpendSummary` / payment audit spend report — **not** a fictional `computeCurrentSpend` name unless aliased.
- Split by [`hybrid-billing-v0.1`](./hybrid-billing-v0.1.md):
  - Subscription-included / overage → Stripe Billing meter events on the metered Price.
  - Prepaid credit usage → **ledger debit only** (`DeductionService`) — never Stripe meter API.

---

## 6. WORM entries

```typescript
type ProvisioningWORMEntryType =
  "ORG_PROVISIONED" | "ORG_MEMBER_ADDED" | "ORG_PLAN_CHANGED" | "USAGE_REPORTED_TO_BILLING";
```

Same payments / clawql-audit trail. No separate billing audit schema.

---

## 7. Six build pieces (plus Stripe dashboard prep)

**Stripe account / product setup is a live-billing blocker, not a schema blocker.** Spec + `Org` fields + `provisionOrg` Effect can land before Products exist; Checkout and meter reporting cannot go live without § Stripe setup in [hybrid-billing-v0.1](./hybrid-billing-v0.1.md).

| #   | Piece                                                                   | New vs reuse                             |
| --- | ----------------------------------------------------------------------- | ---------------------------------------- |
| 0   | Stripe Products / Prices / metered overage / credit top-up Prices       | **Ops** (dashboard) — see hybrid-billing |
| 1   | Org billing fields on `OrgRecord` + membership (already mostly shipped) | Extend store                             |
| 2   | `provisionOrg` Effect Tag + Layer                                       | **New** orchestration                    |
| 3   | Stripe webhook → `provisionOrg` (converge CF gateway + Node)            | **New** wiring                           |
| 4   | Internal admin tool (enterprise trigger)                                | **New** CLI/MCP/UI                       |
| 5   | `reportUsageToStripe`                                                   | **New** thin wrapper                     |
| 6   | Self-serve dashboard (keys, usage, upgrade / top-up)                    | **New** UI surface                       |

**Credit ledger + debit-on-inference:** already shipped (`CreditsLedgerService`, `DeductionService`). Spec requires CPC to **wire** them, not reinvent — details in hybrid-billing § Prepaid.

---

## 8. Build order (answer)

1. **Stripe dashboard Products/Prices (ops)** — required before live Checkout / meters; not required to land schema + `provisionOrg` unit tests with dry-run Stripe.
2. Org billing fields + `provisionOrg` (dry-run / fake Stripe ids).
3. Webhook convergence (self-serve).
4. Enterprise admin trigger.
5. `reportUsageToStripe` + meter env.
6. Dashboard UI.

---

## 9. What this deliberately does not add

- A second Org/OrgMember database beside `org-credits.json`
- `SpendRole` / `spend_admin` as a parallel enum to `OrgMemberRole`
- A second credit ledger type named `CreditLedger`
- Folding outbound USDC spend-governance into customer billing
- ACP “checkout” confused with Stripe Checkout

---

| #   | Piece                                | Status                                                                    |
| --- | ------------------------------------ | ------------------------------------------------------------------------- |
| 0   | Stripe Products / Prices / meters    | Ops — [stripe-products-ops.md](../../payments/stripe-products-ops.md)     |
| 1   | Org billing fields                   | ✅ shipped                                                                |
| 2   | `provisionOrg` Effect                | ✅ shipped                                                                |
| 3   | Webhook converge (Node + CF handoff) | ✅ Node webhook + HTTP routes; CF optional forward                        |
| 4   | Enterprise admin trigger             | ✅ CLI                                                                    |
| 5   | `reportUsageToStripe`                | ✅ shipped                                                                |
| 6   | Self-serve dashboard UI              | ✅ `/credits/org` — [full scope](./customer-dashboard-full-scope-v0.1.md) |

**Operator guide:** [`docs/payments/customer-provisioning-core.md`](../../payments/customer-provisioning-core.md)

## Concrete implementation slice

1. Additive `OrgBillingFields` on org-credits store + loader tests. ✅
2. `ProvisionOrgService` Effect Tag; unit test: org-of-1 → one `billing_admin` member + key metadata `orgId`. ✅
3. Map CF gateway `checkout.session.completed` onto `provisionOrg` (or documented handoff). ✅ Node + CF `CLAWQL_CPC_PROVISION_URL` forward
4. WORM `ORG_PROVISIONED` / `ORG_MEMBER_ADDED`. ✅
5. Cross-link hybrid-billing for subscription vs credits vs hybrid. ✅

## Related

- [Hybrid billing v0.1](./hybrid-billing-v0.1.md)
- [Operator guide](../../payments/customer-provisioning-core.md)
- [Stripe ops](../../payments/stripe-products-ops.md)
- [org-credits](../../payments/org-credits.md)
- [clawql-payments](../../payments/clawql-payments.md)
- [deduction-service](../../payments/deduction-service.md)
- [spend-governance v0.1](../spend/spend-governance-v0.1.md) — outbound only
