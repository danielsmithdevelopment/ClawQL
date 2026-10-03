# Supabase managed signup (clawql.com)

**Status:** Spec v0.1 — `clawql-supabase` provider plugin + www signup path  
**Package:** [`packages/clawql-supabase`](../../../packages/clawql-supabase)  
**Related:** [Customer Provisioning Core](../billing/customer-provisioning-core-v0.1.md) · [OIDC consumer](../../security/clawql-auth-oidc-stepup.md) · [Enterprise control plane](../../enterprise/control-plane.md)

## Principle

ClawQL is **not** an IdP. Supabase Auth is the **human account** layer for managed clawql.com signup. MCP runtime auth stays API-key / customer OIDC + ATR. Org billing and keys stay on CPC:

```
Supabase Auth (signup/login)
  → Stripe Checkout (CPC metadata + clawql_supabase_user_id)
  → provisionOrg
  → IssuedApiKeyStore (raw key once)
```

## Env

| Variable                                                     | Role                                      |
| ------------------------------------------------------------ | ----------------------------------------- |
| `CLAWQL_ENABLE_SUPABASE=1`                                   | Register `clawql-supabase` ProviderPlugin |
| `CLAWQL_SUPABASE_URL`                                        | Project URL                               |
| `CLAWQL_SUPABASE_JWT_SECRET`                                 | HS256 verify (legacy)                     |
| `CLAWQL_SUPABASE_JWKS_URL`                                   | Optional JWKS override                    |
| `CLAWQL_SUPABASE_ANON_KEY`                                   | Auth REST (server helpers)                |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clawql.com browser signup                 |

Instance CRD: `spec.supabase.enabled: true` (horizontal tier).

## MCP tools

- `supabase_verify_session` — verify access token → `sub` / `email`
- `supabase_checkout_handoff` — verify + build CPC metadata including `clawql_supabase_user_id`

## Checkout metadata

Extends existing CPC keys with:

- `clawql_supabase_user_id` — Supabase Auth `sub`
- `ownerMemberTenantId` derived as `supabase:{id}` in `provisionOrgInputFromCheckoutSession`

## Non-goals

- Hosting MCP, WORM, or vault in Supabase
- Replacing enterprise SSO / WorkOS / customer IdP for company orgs
- Minting ClawQL API keys from Supabase JWTs
