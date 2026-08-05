# Enterprise control plane

**Status:** Tier-1 scaffold  
**Audience:** Company billing admins (CFO), IT (SSO), platform operators

ClawQL is building a **company-scoped control plane** on top of closed-loop org credits and OIDC JWT consumption. This is not a consumer payments network and ClawQL is **not an IdP**.

## Product shape

| Capability | What shipped (scaffold) | Next |
| --- | --- | --- |
| **SSO under company email** | OIDC maps `email` / `hd`; `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS` enforces domain; org `sso.allowedEmailDomains` + `findOrgByEmailDomain` | Per-org issuer/JWKS routing; Auth-code login UI; SCIM |
| **User management** | `inviteOrgMember`, `listOrgMembers`, `suspend` / `remove` / `reactivate`; CLI `clawql payments org …` | Manager scopes; seat entitlements; IdP group sync |
| **Unified spend + billing** | `getOrgUnifiedSpendSummary` (pool + member balances; optional WORM filter) | Member → pool → Stripe overage waterfall; Stripe invoice join |
| **Observability** | Prometheus text: `clawql_org_*` gauges via `org spend --prometheus` | Grafana panel pack; deduction counters |

## Roles (same as org credits)

| Role | Typical persona | Capabilities |
| --- | --- | --- |
| `billing_admin` | CFO / owner | SSO domains, invites, suspend/remove, allocate, period distribute, spend view |
| `manager` | Team lead | (Next) team usage; transfer to reports |
| `member` | Employee / intern | Spend credits; within-org transfer |

## SSO under `@company.com`

ClawQL **consumes** IdP tokens (Okta / Entra / Google Workspace). Domain restriction:

1. **IdP side (required for production):** restrict app assignment to the company directory.
2. **ClawQL gateway:** set allowed domains so foreign emails cannot present a token even if mis-issued:

```bash
export CLAWQL_AUTH_MODE=oidc
export CLAWQL_AUTH_OIDC_JWKS_URL=https://idp.example/.well-known/jwks.json
export CLAWQL_AUTH_OIDC_ISSUER=https://idp.example
export CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS=acme.com,acme.co.uk
```

3. **Org registry:** bind the same domains on the company org so invites and directory resolution stay closed-loop:

```bash
clawql payments org create --org-id acme --actor-tenant cfo --domains acme.com --email cfo@acme.com
clawql payments org sso --org-id acme --actor-tenant cfo --domains acme.com,acme.co.uk
clawql payments org invite --org-id acme --actor-tenant cfo --email intern@acme.com --role intern
```

ATR claims gain optional `email`, `emailVerified`, `emailDomain`, `orgId` (see `clawql-auth`).

## User management CLI

```bash
clawql payments org members --org-id acme
clawql payments org suspend --org-id acme --actor-tenant cfo --member-tenant acme:intern-acme-com
clawql payments org remove  --org-id acme --actor-tenant cfo --member-tenant …
```

## Unified spend + observability

```bash
# CFO JSON snapshot (credits pool + members)
clawql payments org spend --org-id acme --actor-tenant cfo

# Optional WORM payment rows for org tenant ids
clawql payments org spend --org-id acme --include-worm

# Prometheus text for scraping / Grafana
clawql payments org spend --org-id acme --prometheus
```

Metrics (gauges): `clawql_org_pool_balance_cents`, `clawql_org_member_balance_cents`, `clawql_org_total_credits_cents`, `clawql_org_member_count`, `clawql_org_member_balance_cents_by_tenant`.

## Compliance boundary

Managed hosting may enable **closed-loop company credits** and company-email SSO. Cross-tenant Venmo-like P2P and agent compensation remain self-hosted opt-in — see [hosted vs self-hosted compliance](../payments/hosted-vs-self-hosted-compliance.md) and [org credits](../payments/org-credits.md).

## Related packages

- [`clawql-auth`](../../packages/clawql-auth) — OIDC consumer + email-domain policy  
- [`clawql-payments` org module](../../packages/clawql-payments/src/credits/org.ts) — membership + budgets  
- [`org-spend.ts`](../../packages/clawql-payments/src/credits/org-spend.ts) / [`org-metrics.ts`](../../packages/clawql-payments/src/credits/org-metrics.ts)
