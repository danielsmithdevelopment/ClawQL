# Enterprise control plane

**Status:** Tier-1 + next slices  
**Audience:** Company billing admins (CFO), IT (SSO), platform operators

ClawQL is building a **company-scoped control plane** on top of closed-loop org credits and OIDC JWT consumption. This is not a consumer payments network and ClawQL is **not an IdP** — it **verifies** customer IdP tokens (and can route per-org JWKS).

## Product shape

| Capability | Status |
| --- | --- |
| **SSO under company email** | OIDC maps `email` / `hd`; domain allowlists; **per-org IdP routing** (`issuer` / `jwksUrl` by domain) |
| **User management** | Invite / list / suspend / remove; **seat entitlements**; **manager scopes** + transfer to reports |
| **Unified spend + billing** | Pool + member snapshot; **member → pool → Stripe overage** waterfall holds |
| **Observability** | Prometheus `clawql_org_*` + waterfall counters; **Grafana** [`clawql-enterprise-org-spend.json`](../grafana/clawql-enterprise-org-spend.json) |

## Roles

| Role | Typical persona | Capabilities |
| --- | --- | --- |
| `billing_admin` | CFO / owner | SSO domains, invites, seats, suspend/remove, allocate, period distribute, full spend view |
| `manager` | Team lead | View self + direct reports; transfer from own balance to reports |
| `member` | Employee / intern | Spend credits; within-org peer transfer |

## SSO under `@company.com` (+ per-org IdP)

```bash
export CLAWQL_AUTH_MODE=oidc
# Global fallback (single-tenant / default IdP):
export CLAWQL_AUTH_OIDC_JWKS_URL=https://idp.example/.well-known/jwks.json
export CLAWQL_AUTH_OIDC_ISSUER=https://idp.example
export CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS=acme.com

# Multi-tenant: bind IdP per company org, then use createOrgCreditsIdpRouter +
# verifyOidcBearerTokenWithOrgRouting from clawql-auth.
clawql payments org create --org-id acme --actor-tenant cfo --domains acme.com --email cfo@acme.com
clawql payments org sso --org-id acme --actor-tenant cfo --domains acme.com
```

Library:

```ts
import { verifyOidcBearerTokenWithOrgRouting } from "clawql-auth";
import { createOrgCreditsIdpRouter } from "clawql-payments";

const result = await verifyOidcBearerTokenWithOrgRouting(token, {
  router: createOrgCreditsIdpRouter(),
});
// result.claims.orgId set from route when domain matches
```

## Seats + manager scopes

```bash
# Plan seats (free=1, pro=1, team=20, enterprise=∞) or hard cap:
# set via library setOrgSeatPolicy({ planId: "team", seatLimit: 50 })

clawql payments org invite --org-id acme --actor-tenant cfo --email intern@acme.com --role intern
# Managers: add with orgRole=manager, set reportsToTenantId on members
```

`transferManagerToReport` — manager tops up a direct report from their own balance (still closed-loop).

## Deduction waterfall

```ts
import { holdOrgWaterfall } from "clawql-payments";

const held = await holdOrgWaterfall({
  orgId: "acme",
  memberTenantId: "intern1",
  amountCents: 1000,
  idempotencyKey: "inference-req-1",
  allowOverage: true, // remainder → overageCents for Stripe meter
});
// slices: member → pool → overage
```

Wire capture/release on each slice’s `idempotencyKey` (`…:member` / `…:pool`). Overage is **not** a ledger hold — bill via Stripe meter / invoice to the billing admin.

## Unified spend + Grafana

```bash
clawql payments org spend --org-id acme --actor-tenant cfo
clawql payments org spend --org-id acme --prometheus
```

Import [`docs/grafana/clawql-enterprise-org-spend.json`](../grafana/clawql-enterprise-org-spend.json) (UID `clawql-enterprise-org-spend`). See [`docs/grafana/README.md`](../grafana/README.md).

## Compliance boundary

Managed hosting may enable **closed-loop company credits** and company-email SSO. Cross-tenant Venmo-like P2P and agent compensation remain self-hosted opt-in — see [hosted vs self-hosted compliance](../payments/hosted-vs-self-hosted-compliance.md) and [org credits](../payments/org-credits.md).

## Related packages

- [`clawql-auth`](../../packages/clawql-auth) — OIDC consumer, email-domain policy, **org IdP routing**  
- [`org.ts`](../../packages/clawql-payments/src/credits/org.ts) — membership, seats, managers  
- [`org-waterfall.ts`](../../packages/clawql-payments/src/credits/org-waterfall.ts) — spend hierarchy  
- [`org-idp-router.ts`](../../packages/clawql-payments/src/credits/org-idp-router.ts) — payments → auth bridge
