# Supabase managed signup (clawql.com)

**Status:** Spec v0.2 — `clawql-supabase` CPC/clawql.com middleware (no MCP tools)  
**Package:** [`packages/clawql-supabase`](../../../packages/clawql-supabase)  
**Related:** [Customer Provisioning Core](../billing/customer-provisioning-core-v0.1.md) · [OIDC consumer](../../security/clawql-auth-oidc-stepup.md) · [Enterprise control plane](../../enterprise/control-plane.md)

## Principle

ClawQL is **not** an IdP. Supabase Auth is the **human account** layer for managed clawql.com signup. MCP runtime auth stays API-key / customer OIDC + ATR. Org billing and keys stay on CPC:

```
Supabase Auth (signup/login)
  → POST CPC /checkout/session with Authorization: Bearer <supabase JWT>
  → Stripe Checkout (metadata clawql_user_id)
  → signed checkout.session.completed webhook
  → idempotent provisionOrg
  → IssuedApiKeyStore (raw key once)
```

Agents hold **capabilities**, never credentials. Session JWTs must not enter an agent context. `clawql-supabase` therefore has **no MCP tools**.

## Env

| Variable                                                     | Role                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `CLAWQL_ENABLE_SUPABASE=1`                                   | Load `clawql-supabase` ProviderPlugin (skills/vault only)     |
| `CLAWQL_SUPABASE_URL`                                        | Project URL                                                   |
| `CLAWQL_SUPABASE_JWKS_URL`                                   | JWKS verify (**default**; derived from URL when unset)        |
| `CLAWQL_SUPABASE_JWT_SECRET`                                 | HS256 verify (**fallback** only)                              |
| `CLAWQL_SUPABASE_JWT_ISSUER` / `CLAWQL_SUPABASE_JWT_AUDIENCE` | Default `{url}/auth/v1` and `authenticated`                 |
| `CLAWQL_SUPABASE_ANON_KEY`                                   | Auth REST (browser/server signup helpers)                     |
| `CLAWQL_SUPABASE_SERVICE_ROLE_KEY`                           | Admin delete of the Auth user (cascade)                       |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clawql.com browser signup                                     |

Instance CRD: `spec.supabase.enabled: true` (horizontal tier).

JWT verify checks issuer, audience, expiry, and role. Privileged account operations (checkout, deletion) **reject** anonymous-role tokens.

**None.** Session JWTs must never enter agent context. Checkout and session verify stay on clawql.com / CPC (HTTP), not MCP. Agents are never issued `supabase_verify_session` or `supabase_checkout_handoff` (also listed in `AGENT_NEVER_ISSUED_CAPABILITIES`).

## Identities

Do **not** key tenants as `supabase:{id}`. Each human gets an internal ClawQL user id (`usr_…`) in `IdentityStoreService` (`$CLAWQL_HOME/Auth/identities.json`) with linked identities (`supabase:…`, later `okta:…` / `entra:…`). CPC `ownerMemberTenantId` is that `usr_…` id.

## Checkout

- The checkout HTTP body must **not** accept `supabaseUserId`. Derive the subject from a verified `Authorization: Bearer` access token.
- Provision orgs **only** from Stripe's signed `checkout.session.completed` webhook (never the browser success redirect).
- Persist `stripeCheckoutSessionId` on the org and skip API-key re-issue on webhook retry so a replay cannot create two orgs or two keys.

## Account deletion

`POST /payments/account/delete` (same privileged JWT) cascades:

1. Revoke issued API keys for the ClawQL user
2. Delete provisioned orgs (credits store)
3. Delete the Stripe customer
4. Delete the Supabase Auth user (service role)
5. Crypto-shred matching vault notes (existing memory erase — WORM `pathId` / content hash)
6. Remove the identity record

WORM `ACCOUNT_DELETED` stores **hashed** user / org / Supabase subject / Stripe customer references only.

## Customer-facing Supabase (separate product)

If agents should work with **users'** Supabase projects, that is an ordinary **source**, not this signup plugin. Describe the Management API and each project's REST endpoint as OpenAPI. Spec-derived risk then applies automatically: reads allowed, writes needing a mandate, deletes blocked.

## Non-goals

- Hosting MCP, WORM, or vault in Supabase
- Replacing enterprise SSO / customer IdP for company orgs (those become additional linked identities)
- Minting ClawQL API keys from Supabase JWTs
- MCP tools for session verify or checkout handoff
