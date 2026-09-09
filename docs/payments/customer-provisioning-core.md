# Customer Provisioning Core (CPC)

**Status:** Implementation slice shipped (PR track)  
**Package:** `clawql-payments` → [`src/provisioning/`](../../packages/clawql-payments/src/provisioning/)  
**Specs:** [customer-provisioning-core-v0.1](../specs/billing/customer-provisioning-core-v0.1.md) · [hybrid-billing-v0.1](../specs/billing/hybrid-billing-v0.1.md)  
**Org store:** `$CLAWQL_HOME/Payments/org-credits.json` (extends [org-credits](./org-credits.md))  
**API keys:** `$CLAWQL_HOME/Auth/api-keys.json` (`IssuedApiKeyStore` from `clawql-auth`)

## Principle

**Every customer is an org.** Self-serve signup and enterprise sales both call one Effect: `ProvisionOrgService.provisionOrg`. There is no separate individual-account table. Org-of-1 = one member with `orgRole: "billing_admin"`.

Spend-governance (outbound USDC) is **out of scope** here — see [spend-governance](../specs/spend/spend-governance-v0.1.md).

---

## Modules

| Path                                    | Role                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `provisioning/types.ts`                 | `ProvisionOrgInput` / `ProvisionOrgResult` / usage report types                     |
| `provisioning/helpers.ts`               | org id slug, owner tenant id, plan → API key scopes                                 |
| `provisioning/provision-org-service.ts` | Effect Tag + Layer; create/patch org, ledger ensure, invite extras, issue key, WORM |
| `provisioning/report-usage.ts`          | `reportUsageToStripe` — overage-only Stripe meter                                   |
| `provisioning/checkout-handoff.ts`      | Stripe Checkout Session → `ProvisionOrgInput`                                       |
| `provisioning/http.ts`                  | Express routes for internal provision + usage report (gateway converge)             |
| `provisioning/dashboard-*.ts`           | Self-serve `/credits/org` HTML + HTTP                                               |
| `dashboard/topology-*.ts`               | Topology types + `TopologyService` aggregator (mesh / agents / celld)               |
| `credits/org.ts`                        | `OrgBillingFields`, `createOrg`, `patchOrgBilling`                                  |
| `stripe/stripe-webhook-service.ts`      | `checkout.session.completed` → `provisionOrg` when CPC metadata present             |

---

## Data model (additive on `OrgRecord`)

| Field                  | Values                                                              | Notes                         |
| ---------------------- | ------------------------------------------------------------------- | ----------------------------- |
| `createdVia`           | `self_serve` \| `enterprise_sales`                                  | How the org was first created |
| `billingMode`          | `stripe_checkout` \| `stripe_invoice` \| `hybrid` \| `credits_only` | Stripe settlement mode        |
| `planId`               | `free` \| `pro` \| `team` \| `enterprise`                           | Required after provision      |
| `stripeCustomerId`     | optional                                                            | Linked Stripe Customer        |
| `stripeSubscriptionId` | optional                                                            | Linked Subscription           |

Membership stays `OrgMemberRole`: `billing_admin` \| `manager` \| `member`. Solo owner = sole `billing_admin`.

---

## Dual triggers

| Trigger    | Who                                 | Typical `billingMode`                         | Entry point                                   |
| ---------- | ----------------------------------- | --------------------------------------------- | --------------------------------------------- |
| Self-serve | Stripe `checkout.session.completed` | `stripe_checkout` / `hybrid` / `credits_only` | Node webhook **or** CF gateway → HTTP handoff |
| Enterprise | Admin after deal close              | `stripe_invoice` / `hybrid`                   | CLI `payments org provision`                  |

Nothing else forks provision logic.

### Checkout metadata (self-serve)

Set on the Stripe Checkout Session so Node/gateway can call CPC:

| Metadata key                  | Required                 | Meaning                                    |
| ----------------------------- | ------------------------ | ------------------------------------------ |
| `clawql_provision_org`        | or use `clawql_org_name` | `1` / `true` enables CPC                   |
| `clawql_org_name`             | preferred                | Display name → org id slug                 |
| `clawql_org_id`               | optional                 | Explicit org id                            |
| `clawql_owner_email`          | or session email         | Owner / billing admin email                |
| `clawql_plan` / `clawql_tier` | optional                 | Maps to `ClawqlPlanId` (default `pro`)     |
| `clawql_billing_mode`         | optional                 | Override; `mode=payment` ⇒ `credits_only`  |
| `clawql_created_via`          | optional                 | `enterprise_sales` or default `self_serve` |
| `clawql_member_emails`        | optional                 | Comma-separated extra seats                |

Parser: `provisionOrgInputFromCheckoutSession(session)`.

### Cloudflare gateway convergence

Today the Worker still upserts a **D1 tenant** + edge API token on Checkout (hosted auth). CPC org store + default `cqk_` API key live in **Node payments**.

**Converge path (preferred):**

1. Gateway finishes D1 upsert (unchanged).
2. If `CLAWQL_CPC_PROVISION_URL` is set, gateway `POST`s the Checkout session JSON to that URL with `Authorization: Bearer <CLAWQL_CPC_PROVISION_TOKEN>`.
3. Node mounts `attachProvisioningRoutes` and runs the same `provisionOrg` Effect.

Env (Worker):

| Binding / secret             | Meaning                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `CLAWQL_CPC_PROVISION_URL`   | e.g. `https://payments.internal/payments/provision-org-from-checkout` |
| `CLAWQL_CPC_PROVISION_TOKEN` | Shared bearer; must match Node `CLAWQL_CPC_PROVISION_TOKEN`           |

Node still processes Checkout when Stripe webhooks are forwarded to payments (`clawql payments stripe webhook verify --process`) with the same metadata — either edge is enough if only one receives the event; **do not double-provision without idempotent re-entry** (CPC patches billing fields when the org already exists; a second API key is issued unless you set `skipApiKey`).

---

## Effect surfaces

```ts
import { Effect } from "effect";
import { ProvisionOrgService, ReportUsageService, runPaymentsEffect } from "clawql-payments";

await runPaymentsEffect(
  Effect.gen(function* () {
    const provision = yield* ProvisionOrgService;
    return yield* provision.provisionOrg({
      orgName: "Acme",
      ownerEmail: "owner@acme.com",
      planId: "team",
      createdVia: "enterprise_sales",
      billingMode: "stripe_invoice",
      stripeCustomerId: "cus_…",
    });
  })
);
```

Requirements: `CLAWQL_CREDITS_ENABLED=1`. Runtime layer wires `PaymentAuditService` + `IssuedApiKeyStoreService` + `CreditsLedgerService`.

### `reportUsageToStripe`

- Sums monthly inference usage for pool + members via `UsageStoreService`.
- Overage = `max(0, total − plan.inference_calls_per_month)` (or explicit `overageUnits`).
- **Never** meters when `billingMode === "credits_only"`.
- Requires `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`, org `stripeCustomerId`, and `STRIPE_METER_EVENT_NAME`.
- WORM: `USAGE_REPORTED_TO_BILLING`. Credit debits stay on `DeductionService` only.

---

## HTTP (internal)

Mount on the payments / MCP HTTP host:

```ts
import express from "express";
import { attachProvisioningRoutes } from "clawql-payments";

const app = express();
app.use(express.json());
attachProvisioningRoutes(app); // or attachProvisioningRoutes(app, { basePath: "/payments" })
```

| Method | Path                                    | Auth                                | Body                                              |
| ------ | --------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `POST` | `/payments/provision-org`               | Bearer `CLAWQL_CPC_PROVISION_TOKEN` | `ProvisionOrgInput` JSON                          |
| `POST` | `/payments/provision-org-from-checkout` | same                                | Stripe Checkout Session object (or `{ session }`) |
| `POST` | `/payments/report-usage`                | same                                | `{ orgId, month?, overageUnits? }`                |

If `CLAWQL_CPC_PROVISION_TOKEN` is unset, routes return **503** (disabled). Do not expose these without a network boundary + token.

---

## CLI

```bash
export CLAWQL_CREDITS_ENABLED=1
export CLAWQL_HOME=./.clawql

# Enterprise / admin trigger
clawql payments org provision \
  --email owner@acme.com \
  --name Acme \
  --org-id acme \
  --plan team \
  --billing-mode stripe_invoice \
  [--stripe-customer cus_…] \
  [--member-emails a@acme.com,b@acme.com] \
  [--json]

# Overage meter report (subscription / hybrid only)
clawql payments org report-usage --org-id acme [--month 2026-09] [--overage 42]

# Legacy low-level create (no API key / CPC billing required)
clawql payments org create --org-id acme --actor-tenant cfo
```

Raw API key is printed **once** on provision — never written to WORM.

---

## WORM events

| Action                      | When                                   |
| --------------------------- | -------------------------------------- |
| `ORG_PROVISIONED`           | First create (not idempotent patch)    |
| `ORG_MEMBER_ADDED`          | Owner + each additional invite         |
| `ORG_PLAN_CHANGED`          | Reserved builder (plan change flows)   |
| `USAGE_REPORTED_TO_BILLING` | Successful Stripe meter overage report |

Provider on org events: `billing`. Raw API secrets never appear in audit payloads.

---

## Env cheat sheet

| Env                                              | Role                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `CLAWQL_CREDITS_ENABLED`                         | Required for provision                                                             |
| `CLAWQL_API_KEYS_PATH`                           | Override issued-key store path                                                     |
| `CLAWQL_CPC_PROVISION_TOKEN`                     | Shared secret for HTTP provision routes                                            |
| `CLAWQL_PAYMENTS_REPORT_STRIPE_METER`            | Enable meter reporting                                                             |
| `STRIPE_METER_EVENT_NAME` / `STRIPE_CUSTOMER_ID` | Meter config (org prefers its own `stripeCustomerId`)                              |
| `STRIPE_PRO_PRICE_ID` / `STRIPE_TEAM_PRICE_ID`   | Live Checkout Prices ([ops runbook](./stripe-products-ops.md))                     |
| `CLAWQL_MCP_UI_TRACE_BASE`                       | Optional flamegraph base (default `/mcp-ui/trace`)                                 |
| `CLAWQL_TOPOLOGY_SNAPSHOT`                       | Optional JSON path `{ gateways: GatewayNode[] }` for topology override             |
| `CLAWQL_CPC_DASHBOARD_RETURN_URL`                | Stripe Portal return URL override                                                  |
| `CELLD_BUCKET`                                   | When set, topology tries `celld cell list --json` for cell agents                  |

---

## Build status vs six pieces

| #   | Piece                                | Status                                                                              |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| 0   | Stripe Products / Prices / meters    | Ops — [stripe-products-ops.md](./stripe-products-ops.md)                            |
| 1   | Org billing fields                   | ✅                                                                                  |
| 2   | `provisionOrg` Effect                | ✅                                                                                  |
| 3   | Webhook converge (Node + CF handoff) | ✅ Node; CF optional POST when URL set                                              |
| 4   | Enterprise admin trigger             | ✅ CLI                                                                              |
| 5   | `reportUsageToStripe`                | ✅                                                                                  |
| 6   | Self-serve dashboard UI              | ✅ `/credits/org` — full scope (plan, keys, usage, topology, embedded traces)       |

---

## Self-serve dashboard (`/credits/org`)

Full-scope command center ([customer-dashboard-full-scope-v0.1](../specs/billing/customer-dashboard-full-scope-v0.1.md)):

| #   | Section        | Behavior                                                                                                                                                |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plan / billing | Plan, `billingMode`, Stripe Customer Portal (upgrade/downgrade), link to credit top-up                                                                  |
| 2   | API keys       | List active org keys; issue / rotate (revoke + issue); secret shown once                                                                                |
| 3   | Usage          | **`getOrgUnifiedSpendSummary`** (+ optional WORM spend) — not `computeCurrentSpend`                                                                     |
| 4   | Topology       | Hierarchical gateways (`regional` \| `edge`) + agents (`persistent` \| `cell`); status dots; collapsed by default; empty → “connect your first gateway” |
| 5   | Traces         | Embedded iframe of existing `/mcp-ui/trace/compare` + WORM rows; topology `trace` links focus the embed                                                 |

Topology is a read aggregation (`TopologyService`) over Headscale/Tailscale mesh, ManagedGateway, compensation accounts, and `celld cell list` when `CELLD_BUCKET` is set. Optional override: `CLAWQL_TOPOLOGY_SNAPSHOT`.

```bash
# After provision
open "http://localhost:<port>/credits/org?orgId=acme&tenant=acme:owner"
```

Auth: same gate as `/credits/*` HATEOAS. Mutations (portal, key issue/rotate) require billing admin.

---

## Related

- [org-credits.md](./org-credits.md)
- [deduction-service.md](./deduction-service.md)
- [credits-ach.md](./credits-ach.md)
- [clawql-payments.md](./clawql-payments.md)
- [stripe-products-ops.md](./stripe-products-ops.md)
- Specs: [billing README](../specs/billing/README.md) · [dashboard full scope](../specs/billing/customer-dashboard-full-scope-v0.1.md)
