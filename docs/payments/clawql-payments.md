# clawql-payments

**Status:** Shipped foundation (July 2026)  
**Package:** [`packages/clawql-payments`](../../packages/clawql-payments)  
**CLI:** `clawql payments *`

`clawql-payments` is ClawQL's unified payments layer. It powers ClawQL's own managed tiers (Free / Pro / Team / Enterprise) and is available to self-hosted operators and ClawQL users who want to bill their own customers via Stripe, gate HTTP routes and MCP tools via [x402](https://www.x402.org/), and maintain a correlated audit trail across both rails.

## What ships today

| Capability                                       | Status | Notes                                                                          |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| Managed plan tiers + entitlements                | ✅     | Local `usage.json` counters; limit enforcement in inference                    |
| Stripe customers, subscriptions, invoices        | ✅     | Live SDK when `STRIPE_SECRET_KEY` is set                                       |
| Stripe webhook signature verification            | ✅     | CLI verify/process; audit on `invoice.paid`                                    |
| Stripe Billing Meters (`meterEvents.create`)     | ✅     | API + inference hook when `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`              |
| x402 gate config + facilitator HTTP verify       | ✅     | `POST /verify` against x402.org or CDP                                         |
| x402 Express middleware (402 + PAYMENT-REQUIRED) | ✅     | Wired into `clawql-inference` HTTP                                             |
| x402 MCP in-process enforcement                  | ✅     | `CLAWQL_X402_ENFORCE=1` on stdio / Streamable HTTP / gRPC MCP tool calls       |
| Payment WORM audit (hash-chained JSONL)          | ✅     | `$CLAWQL_HOME/Payments/audit.jsonl` + `audit verify`                           |
| Payment WORM audit (Postgres)                    | ✅     | `CLAWQL_PAYMENTS_AUDIT_STORE=postgres` for multi-node deployments              |
| Payment audit → Loki/SIEM export                 | ✅     | Fire-and-forget push on append when `CLAWQL_LOKI_PUSH_URL` is set              |
| `.well-known/payments.json` discovery            | ✅     | Dynamic on MCP + inference HTTP; static route on docs site                     |
| MPP `/openapi.json` discovery                    | ✅     | Dynamic on MCP + inference HTTP; canonical `x-payment-info.offers[]`           |
| MPP HTTP 402 + MCP -32042 runtime                | ✅     | Dual x402 + MPP challenges when `CLAWQL_MPP_ENABLED=1`                         |
| MPP credential verification + receipts           | ✅     | `MppVerificationService` — x402 facilitator + Stripe SPT (`STRIPE_PROFILE_ID`) |

## Architecture

```
clawql-payments
├── stripe/     Subscriptions, invoices, webhooks, Billing Meters
├── x402/       Wallet, gates, facilitator verify/settle, middleware
├── plans/      Tier definitions, entitlements, usage.json counters
├── audit/      Hash-chained append-only JSONL + integrity verify
└── cli/        clawql payments * implementations
```

```mermaid
flowchart TB
  subgraph clients [Clients]
    HTTP[HTTP / OpenAI SDK]
    MCP[MCP tools]
    CLI[clawql payments CLI]
  end

  subgraph inference [clawql-inference]
    X402MW[x402 middleware]
    Auth[Virtual key auth]
    GW[Inference gateway]
    Ent[Entitlement wrapper]
  end

  subgraph payments [clawql-payments]
    Gates[x402-gates.json]
    Plans[plans + usage.json]
    Stripe[Stripe SDK]
    Fac[x402 facilitator HTTP]
    WORM[Payment audit WORM]
  end

  HTTP --> X402MW
  X402MW -->|402 or allow| Auth
  Auth --> GW
  GW --> Ent
  Ent --> Plans
  Ent -->|optional| Stripe
  X402MW --> Gates
  X402MW --> Fac
  X402MW --> WORM
  CLI --> payments
```

### Three usage systems (do not conflate)

ClawQL tracks usage in **three independent layers**. Each serves a different purpose:

| Layer                    | Storage                                          | Purpose                                              | Env / toggle                          |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------- |
| **Plan entitlements**    | `$CLAWQL_HOME/Payments/usage.json`               | Managed tier caps (inference calls/mo, docs, memory) | `CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1` |
| **Inference call store** | jsonl / postgres under `$CLAWQL_HOME/Inference/` | Token counts, latency, export/finetune flywheel      | `CLAWQL_INFERENCE_STORE`              |
| **Virtual key budgets**  | `$CLAWQL_HOME/Inference/virtual-keys.json`       | Per-team USD budget + rate limits                    | `CLAWQL_INFERENCE_KEYS_ENABLED=1`     |

Plan usage drives **quota enforcement** and optional **Stripe Billing Meters**. The call store drives **observability and training data**. Virtual keys drive **per-team spend caps** at auth time.

---

## Local configuration

All local state lives under `$CLAWQL_HOME/Payments/` (default `~/.clawql/Payments/`):

| File              | Contents                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `payments.json`   | Tenant id, plan tier, Stripe metadata, x402 wallet/facilitator            |
| `x402-gates.json` | Payment-gated HTTP paths and MCP tool names                               |
| `usage.json`      | Monthly counters per tenant (`inference_calls`, `documents`, `memory_mb`) |
| `audit.jsonl`     | Append-only hash-chained payment audit log                                |
| `audit.meta.json` | Chain head (`seq`, `last_hash`) for fast append                           |

Example `payments.json`:

```json
{
  "tenantId": "acme-prod",
  "plan": "team",
  "stripe": {
    "accountId": "acct_xxx",
    "customerId": "cus_xxx",
    "meterEventName": "clawql_inference_calls",
    "webhookSecret": "whsec_..."
  },
  "x402": {
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "facilitatorUrl": "https://x402.org/facilitator",
    "defaultAsset": "USDC"
  }
}
```

File modes are `0600`. Never commit secrets or webhook signing keys.

---

## Managed plan tiers

Defined in [`packages/clawql-payments/src/plans/tiers.ts`](../../packages/clawql-payments/src/plans/tiers.ts):

| Plan       | Inference calls/mo | Documents/mo | Memory (MB) | Seats     | x402 |
| ---------- | ------------------ | ------------ | ----------- | --------- | ---- |
| free       | 100                | 10           | 100         | 1         | off  |
| pro        | 10,000             | 500          | 5,000       | 1         | on   |
| team       | 100,000            | 5,000        | 50,000      | 20        | on   |
| enterprise | unlimited          | unlimited    | unlimited   | unlimited | on   |

```bash
clawql payments plan show
clawql payments plan upgrade --tier team
clawql payments usage report --month 2026-07
```

### Inference entitlement enforcement

When `CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1`, every successful inference call:

1. **Pre-check** — `checkEntitlementLimit()` against `usage.json` for the resolved tenant
2. **Execute** — gateway completes the request
3. **Post-record** — increment `inference_calls` in `usage.json`
4. **Optional Stripe meter** — when `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`, emit `billing.meterEvents.create`

Over-limit tenants receive **402 `insufficient_quota`** (OpenAI-compatible error shape).

**Tenant resolution order:**

1. `InferenceRequest.tenantId`
2. Virtual key `team` header
3. `payments.json` → `tenantId`
4. `"default"`

Implementation: [`packages/clawql-inference/src/entitlements/`](../../packages/clawql-inference/src/entitlements/).

---

## Stripe billing

### Prerequisites

1. Stripe account with **Billing Meters** configured in the Dashboard
2. Meter event name matching `STRIPE_METER_EVENT_NAME` or `payments.json` → `stripe.meterEventName`
3. Customer linked via `clawql payments stripe customer create` (persists `customerId`) or `STRIPE_CUSTOMER_ID`

### Environment variables

| Variable                              | Required        | Purpose                                                    |
| ------------------------------------- | --------------- | ---------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                   | Yes (live API)  | Stripe SDK authentication                                  |
| `STRIPE_PRO_PRICE_ID`                 | For Pro subs    | Flat subscription price id                                 |
| `STRIPE_TEAM_PRICE_ID`                | For Team subs   | Flat subscription price id                                 |
| `STRIPE_CUSTOMER_ID`                  | Meter reporting | Override when not in `payments.json`                       |
| `STRIPE_METER_EVENT_NAME`             | Meter reporting | Dashboard meter event name (e.g. `clawql_inference_calls`) |
| `CLAWQL_PAYMENTS_REPORT_STRIPE_METER` | Meter reporting | Set to `1` to emit meter events after each inference call  |

### Setup flow

```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_PRO_PRICE_ID=price_...
export STRIPE_TEAM_PRICE_ID=price_...
export STRIPE_METER_EVENT_NAME=clawql_inference_calls

# 1. Store webhook secret locally (never commit)
clawql payments stripe setup --webhook-secret whsec_...

# 2. Create customer (persists customerId to payments.json)
clawql payments stripe customer create --email billing@acme.com --name "Acme Inc"

# 3. Create subscription for flat tier fee
clawql payments stripe subscription create --customer cus_xxx --plan pro

# 4. Enable meter reporting on inference
export CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1
export CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1
clawql inference serve --port 8080
```

### Meter event idempotency

Each meter event includes an `identifier` for Stripe-side deduplication:

- With correlation id: `inference:{tenantId}:{correlationId}`
- Without: `inference:{tenantId}:{timestamp_ms}`

Replaying the same correlation id within Stripe's dedup window will not double-bill.

### Manual meter report (debug / backfill)

```bash
clawql payments stripe meter report --value 1 --customer cus_xxx \
  --event-name clawql_inference_calls \
  --identifier inference:default:manual-test-001
```

### Webhooks

Webhook verification is **CLI-first** today — suitable for sidecar processors and CI:

```bash
clawql payments stripe webhook verify \
  --payload ./event.json \
  --signature "t=...,v1=..." \
  --process
```

Verified `invoice.paid` events append `STRIPE_INVOICE_PAID` to the payment WORM. Invoice creation alone does **not** write audit entries.

Supported handlers: [`packages/clawql-payments/src/stripe/webhook.ts`](../../packages/clawql-payments/src/stripe/webhook.ts).

---

## x402 micropayments

x402 v2 enables **pay-per-request** access to HTTP routes and MCP tools using USDC on EVM chains. ClawQL integrates facilitator-based verification — clients send a signed payment payload; the server verifies via `POST /verify` before allowing the request.

### When to use x402 vs plan entitlements

| Model                 | Best for                                                          |
| --------------------- | ----------------------------------------------------------------- |
| **Plan entitlements** | Managed SaaS tiers with monthly caps                              |
| **x402 gates**        | Pay-per-call APIs, public endpoints, agent-to-agent micropayments |
| **Both**              | Hybrid: subscription base + overage per call on specific routes   |

They are independent toggles. A route can be x402-gated without plan enforcement, and vice versa.

### Environment variables

| Variable                                | Default                        | Purpose                                      |
| --------------------------------------- | ------------------------------ | -------------------------------------------- |
| `CLAWQL_X402_ENFORCE`                   | off                            | Enable middleware (402 until paid)           |
| `CLAWQL_X402_FACILITATOR_URL`           | `https://x402.org/facilitator` | Facilitator base URL                         |
| `CLAWQL_X402_NETWORK`                   | `eip155:84532`                 | CAIP-2 chain id (Base Sepolia testnet)       |
| `CLAWQL_X402_USDC_ASSET`                | Base Sepolia USDC              | Token contract address                       |
| `CLAWQL_X402_SCHEME`                    | `exact`                        | Payment scheme (`exact` or `upto`)           |
| `CLAWQL_X402_MAX_TIMEOUT_SECONDS`       | `60`                           | Payment validity window                      |
| `CLAWQL_X402_FACILITATOR_BEARER`        | —                              | Bearer token for CDP / private facilitators  |
| `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` | —                              | Coinbase Developer Platform auth alternative |

Wallet and facilitator URL can also be stored in `payments.json` → `x402`.

### Setup flow

```bash
export CLAWQL_X402_ENFORCE=1
export CLAWQL_X402_FACILITATOR_URL=https://x402.org/facilitator

# 1. Configure pay-to wallet
clawql payments x402 wallet setup --address 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# 2. Gate a route or MCP tool
clawql payments x402 gate --resource /v1/chat/completions --price 0.001 --asset USDC
clawql payments x402 gate --tool knowledge_search --price 0.0005

# 3. Start inference with middleware
clawql inference serve --port 8080
```

### HTTP request flow

```mermaid
sequenceDiagram
  participant Client
  participant MW as x402 middleware
  participant Fac as Facilitator
  participant App as Inference handler

  Client->>MW: POST /v1/chat/completions (no payment)
  MW->>Client: 402 + PAYMENT-REQUIRED header (base64 JSON)

  Client->>MW: POST + PAYMENT-SIGNATURE header
  MW->>Fac: POST /verify { paymentPayload, paymentRequirements }
  Fac-->>MW: { isValid: true, payer: 0x... }
  MW->>App: next() — req.x402Payer set
  App-->>Client: 200 completion
```

**Headers:**

| Header                            | Direction      | Purpose                                                |
| --------------------------------- | -------------- | ------------------------------------------------------ |
| `PAYMENT-REQUIRED`                | Response (402) | Base64-encoded `PaymentRequired` JSON                  |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` | Request        | Client payment proof (JSON or base64)                  |
| `X-Clawql-Tool`                   | Request        | Gate MCP tools as `tool:{name}` (HTTP middleware path) |
| `X-Correlation-Id`                | Request        | Audit correlation (optional)                           |

### MCP in-process enforcement

When `CLAWQL_X402_ENFORCE=1`, **native MCP tool calls** (`tools/call` over stdio, Streamable HTTP `/mcp`, or gRPC session transport) run the same `enforceX402Gate()` path as inference HTTP middleware — before the tool handler executes.

Enforcement is registered as **`PaymentsX402ProxyPlugin`** (`kind: mcp-proxy`) on the shared **`McpProxyPipeline`** alongside Panguard — all MCP tools pass through `wrapRegisteredMcpToolHandler` → `runMcpProxyBeforeCallTool`. Disable the plugin with `CLAWQL_PAYMENTS_X402_PROXY_PLUGIN=0` (rare; prefer turning off `CLAWQL_X402_ENFORCE`).

Effect entrypoints: `paymentsServicesLiveLayer()` merges all services; `runPaymentsEffect()` runs programs at async boundaries (CLI, Express, legacy exports). MCP x402 uses native `mcpX402BeforeCallToolEffect` → `X402EnforcementService` (not a `tryPromise` shim).

**Effect services** (`clawql-payments/plugin`):

| Service                    | Responsibility                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| `PaymentsConfigService`    | `payments.json` load/save/merge                                         |
| `PaymentAuditService`      | WORM audit append/list/verify (+ ring buffer + Loki side effects)       |
| `X402GateService`          | `x402-gates.json` CRUD                                                  |
| `X402RuntimeConfigService` | Network, facilitator, wallet from config + env                          |
| `X402FacilitatorService`   | Facilitator verify/settle HTTP                                          |
| `X402EnforcementService`   | Gate enforcement + settlement reconciliation                            |
| `UsageStoreService`        | Monthly usage counters                                                  |
| `EntitlementService`       | Plan limit checks (`EntitlementLimitError`)                             |
| `PaymentsDiscoveryService` | `/.well-known/payments.json` builder                                    |
| `MppOpenApiService`        | MPP `/openapi.json` builder (`x-payment-info.offers[]`)                 |
| `MppVerificationService`   | MPP credential verify (x402 + Stripe SPT), challenge registry, receipts |
| `StripeClientService`      | Stripe SDK client lifecycle                                             |
| `StripeWebhookService`     | Webhook verify + WORM-audited event handling                            |
| `StripeMeterService`       | Meter events + inference usage reporting                                |
| `StripeBillingService`     | Setup, customer, subscription, invoice, portal                          |

Public async exports (`loadPaymentsConfig`, `enforceX402Gate`, `appendPaymentWormEntry`, …) delegate to `runPaymentsEffect`. **Stripe** modules now use Effect services (`StripeClientService`, `StripeWebhookService`, `StripeMeterService`, `StripeBillingService`) with tagged errors (`StripeSignatureError`, `StripeApiError`, …); legacy `Error` subclasses remain at async boundaries for CLI compatibility.

Configure gates with `clawql payments x402 gate --tool <name> --price <usdc>`.

**Payment proof on MCP transports:**

| Transport        | How to attach proof                                             |
| ---------------- | --------------------------------------------------------------- |
| Streamable HTTP  | `PAYMENT-SIGNATURE` / `X-PAYMENT` on the HTTP request to `/mcp` |
| gRPC MCP session | Same header names as gRPC metadata (lowercase keys)             |
| stdio            | No request headers — use Streamable HTTP or gRPC for paid tools |

When payment is required, the tool returns an MCP result with `isError: true` and JSON describing the x402 `PaymentRequired` payload (HTTP 402 semantics in tool output). Invalid proofs emit `X402_PAYMENT_FAILED` audit events (same as HTTP deny paths).

**402 response body** (x402 v2):

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "http://localhost:8080/v1/chat/completions",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "1000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "maxTimeoutSeconds": 60
    }
  ],
  "extensions": { "facilitator": "https://x402.org/facilitator" }
}
```

Amounts are **USDC atomic units** (6 decimals): `0.001 USDC` → `"1000"`.

### CLI reference

```bash
clawql payments x402 wallet setup --address 0x...
clawql payments x402 gate --resource /v1/chat/completions --price 0.001
clawql payments x402 gate --tool knowledge_search --price 0.0005
clawql payments x402 gate list
clawql payments x402 verify --payload ./payment.json --resource /v1/chat/completions
clawql payments x402 reconcile --date 2026-07-11
```

`verify` calls the configured facilitator with a saved payload — useful for debugging client integrations without running the full HTTP server.

### Programmatic usage

```typescript
import {
  createX402Gate,
  createX402PaymentMiddleware,
  enforceX402Gate,
  verifyViaFacilitator,
} from "clawql-payments/x402";
```

Middleware mounts **before** auth in [`packages/clawql-inference/src/api/server.ts`](../../packages/clawql-inference/src/api/server.ts).

---

## Payment audit (WORM)

Payment events append to an **append-only, hash-chained audit log** at `$CLAWQL_HOME/Payments/audit.jsonl`. Each record includes `seq`, `prev_hash`, and `hash` (SHA-256 over canonical JSON) so tampering breaks the chain. By default each append **fsyncs** to disk (`CLAWQL_PAYMENTS_AUDIT_FSYNC=1`).

A hot in-process mirror still feeds the MCP `audit` ring buffer (summary fields only). **Authoritative** payment history — including full structured `payload` — lives in `audit.jsonl`.

| Event                               | Trigger                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `STRIPE_INVOICE_PAID`               | Verified webhook                                                              |
| `STRIPE_PAYMENT_FAILED`             | Verified webhook                                                              |
| `STRIPE_METER_REPORTED`             | Successful meter event                                                        |
| `X402_PAYMENT_RECEIVED`             | Facilitator verify + reconcile                                                |
| `X402_PAYMENT_FAILED`               | Invalid proof, facilitator error, or misconfiguration (not `require_payment`) |
| `ENTITLEMENT_LIMIT_REACHED`         | Plan cap hit                                                                  |
| `PLAN_UPGRADED` / `PLAN_DOWNGRADED` | `clawql payments plan upgrade`                                                |

### Environment

| Variable                        | Default                     | Purpose                                                                    |
| ------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `CLAWQL_PAYMENTS_AUDIT_STORE`   | `jsonl` (`memory` in tests) | `jsonl` = durable file; `memory` = in-process only; `postgres` = shared DB |
| `CLAWQL_PAYMENTS_AUDIT_FSYNC`   | on                          | `fsync` after each append (set `0` to disable; jsonl only)                 |
| `CLAWQL_PAYMENTS_DATABASE_URL`  | —                           | Postgres connection string when `AUDIT_STORE=postgres`                     |
| `CLAWQL_PAYMENTS_DB_*`          | —                           | Component vars (`HOST`, `USER`, `PASSWORD`, `NAME`, `PORT`)                |
| `CLAWQL_INFERENCE_DATABASE_URL` | —                           | Fallback Postgres URL when payments URL is unset (shared DB)               |

### Postgres audit store (enterprise)

For multi-node ClawQL deployments, set:

```bash
export CLAWQL_PAYMENTS_AUDIT_STORE=postgres
export CLAWQL_PAYMENTS_DATABASE_URL=postgres://clawql:secret@db.internal:5432/clawql
# Or reuse the inference database:
# export CLAWQL_INFERENCE_DATABASE_URL=postgres://...
```

Records remain **hash-chained** (`seq`, `prev_hash`, `hash`) in table `clawql_payments_audit`. Chain head metadata lives in `clawql_payments_audit_meta`. `clawql payments audit verify` validates integrity regardless of store backend.

### Loki / SIEM export

Each successful append can push the **full payment payload** (not just MCP ring-buffer summaries) to Grafana Loki:

```bash
export CLAWQL_LOKI_PUSH_URL=https://loki.example.com/loki/api/v1/push
export CLAWQL_LOKI_BEARER_TOKEN=...          # optional
export CLAWQL_LOKI_TENANT_ID=tenant-1        # optional X-Scope-OrgID
export CLAWQL_PAYMENTS_LOKI_JOB=clawql-payments-audit  # optional stream job label
# export CLAWQL_PAYMENTS_LOKI_PUSH=0         # disable payments push only
# export CLAWQL_ENABLE_LOKI_PUSH=0           # disable all Loki push (MCP + payments)
```

Push is **fire-and-forget** — Loki failures log to stderr and do not fail payment processing.

### Payment discovery (`/.well-known/payments.json`)

Self-hosted ClawQL serves a **dynamic** payment discovery document at:

```bash
curl http://localhost:8080/.well-known/payments.json   # MCP HTTP (default PORT)
curl http://localhost:8080/.well-known/payments.json   # inference HTTP (CLAWQL_INFERENCE_PORT)
```

The document lists configured x402 gates (HTTP paths and MCP tools), wallet/facilitator metadata, and Stripe plan/meter info when configured. The docs site serves a static commerce discovery route at `/openapi.json` and `/.well-known/payments.json` for agent readiness scanners.

### MPP discovery (`/openapi.json`)

Self-hosted ClawQL serves a **dynamic** MPP OpenAPI document at:

```bash
curl http://localhost:8080/openapi.json   # MCP HTTP or inference HTTP
```

Each paid route includes `x-payment-info.offers[]` with `x402` and `stripe` methods when configured. Set `CLAWQL_MPP_OPENAPI=0` to disable the route. See [MPP discovery](https://mpp.dev/advanced/discovery).

When `CLAWQL_X402_ENFORCE=1`, HTTP 402 responses include both x402 `PAYMENT-REQUIRED` and MPP `WWW-Authenticate: Payment` challenges. MCP paid-tool errors surface MPP metadata on tool results (`org.paymentauth/payment-required`) for clients that expect JSON-RPC **-32042**.

**Credential verification** runs through `MppVerificationService` (Effect) inside `X402EnforcementService.enforceGate()`:

- `Authorization: Payment …` — canonical MPP credentials (Stripe SPT or x402 payload in `payload`)
- `PAYMENT-SIGNATURE` — legacy x402 credentials (still verified when MPP is enabled)
- Successful verification returns `Payment-Receipt` on HTTP 200 and records settlement in the payment audit WORM
- Stripe SPT charges require `STRIPE_SECRET_KEY` and optionally `STRIPE_PROFILE_ID` / `STRIPE_NETWORK_ID` for Business Network profiles

Challenge IDs issued on `402` are registered for single-use verification (replay protection). Failed verification surfaces MCP **-32043** metadata on deny paths when applicable.

### CLI

```bash
clawql payments audit --correlation-id seed_abc_gen_2
clawql payments audit verify          # validate hash chain integrity
clawql payments audit verify --json
clawql payments spend report --group-by provider
```

`spend report` now aggregates real `amount_usd` / `amount_usdc` values from persisted payloads (not placeholder data).

### Programmatic verify

```typescript
import { verifyPaymentAuditLog } from "clawql-payments";

const result = await verifyPaymentAuditLog();
if (!result.ok) {
  console.error(result.issues);
}
```

---

## Full CLI reference

```bash
# Plans
clawql payments plan show | upgrade --tier team
clawql payments usage report --month 2026-07

# Stripe
clawql payments stripe setup --webhook-secret whsec_...
clawql payments stripe customer create --email user@acme.com
clawql payments stripe subscription create --customer cus_xxx --plan pro
clawql payments stripe invoice create --customer cus_xxx --amount 500
clawql payments stripe meter report --value 1 --customer cus_xxx
clawql payments stripe webhook verify --payload ./event.json --signature "..." --process

# x402
clawql payments x402 wallet setup | gate | gate list | verify | reconcile

# Audit
clawql payments spend report --group-by provider
clawql payments audit --correlation-id xxx
clawql payments audit verify
```

---

## Inference integration checklist

Self-hosted operators enabling the full payments stack:

```bash
# Plan limits
export CLAWQL_PAYMENTS_ENFORCE_INFERENCE=1

# Stripe meter (optional — requires Dashboard meter + customer)
export CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1
export STRIPE_METER_EVENT_NAME=clawql_inference_calls

# x402 pay-per-call (optional — independent of plan limits)
export CLAWQL_X402_ENFORCE=1
export CLAWQL_X402_FACILITATOR_URL=https://x402.org/facilitator

clawql inference serve --port 8080
```

Middleware order in the HTTP app:

1. JSON body parser
2. **x402 payment middleware** (`CLAWQL_X402_ENFORCE`)
3. Virtual key auth (`CLAWQL_INFERENCE_KEYS_ENABLED`)
4. OpenAI-compat router (entitlement check inside gateway + HTTP layer for streaming)

See also: [`packages/clawql-inference/README.md`](../../packages/clawql-inference/README.md).

---

## Troubleshooting

### 402 `insufficient_quota` on inference

- Run `clawql payments plan show` — check `usage.inferenceCalls` vs entitlements
- Confirm tenant id: virtual key `team` must match the tenant you expect
- Enterprise plan uses `Infinity` — verify `payments.json` → `plan`

### x402 402 with `invalid x402 payment payload`

- Header must be valid JSON or base64-encoded JSON matching `PaymentPayloadV2`
- Use `clawql payments x402 verify --payload ./file.json --resource <url>` to test facilitator path

### x402 402 with `x402 wallet address is not configured`

- Run `clawql payments x402 wallet setup --address 0x...`

### Facilitator verify fails

- Check `CLAWQL_X402_FACILITATOR_URL` reaches `/verify` (not double-suffixed)
- For CDP: set `CLAWQL_X402_FACILITATOR_BEARER` or `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`
- Testnet: ensure client payment targets `CLAWQL_X402_NETWORK` and `CLAWQL_X402_USDC_ASSET`

### Stripe meter events not appearing

- Confirm `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`
- Customer id must be in `payments.json` or `STRIPE_CUSTOMER_ID`
- Meter event name must match Dashboard: `STRIPE_METER_EVENT_NAME` or `payments.json` → `stripe.meterEventName`
- Check payment audit for `STRIPE_METER_REPORTED` or CLI errors

### Webhook signature failures

- Use raw request body (not re-serialized JSON) for verification
- Secret from `clawql payments stripe setup` or `payments.json` → `stripe.webhookSecret`

---

## Follow-up work

| Item                         | Tracking     |
| ---------------------------- | ------------ |
| Hosted webhook HTTP endpoint | not CLI-only |

## Related

- Package README: [`packages/clawql-payments/README.md`](../../packages/clawql-payments/README.md)
- Inference doc: [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md)
- x402 protocol: [x402.org](https://www.x402.org/)
