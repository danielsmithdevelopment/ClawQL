# Supabase managed signup (clawql.com)

**Status:** Spec v0.3 — `clawql-supabase` CPC/clawql.com middleware (no MCP tools)  
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

| Variable                                                      | Role                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `CLAWQL_ENABLE_SUPABASE=1`                                    | Load `clawql-supabase` ProviderPlugin (skills/vault only) |
| `CLAWQL_SUPABASE_URL`                                         | Project URL                                               |
| `CLAWQL_SUPABASE_JWKS_URL`                                    | JWKS verify (**default**; derived from URL when unset)    |
| `CLAWQL_SUPABASE_JWT_SECRET`                                  | HS256 verify (**fallback** only)                          |
| `CLAWQL_SUPABASE_JWT_ISSUER` / `CLAWQL_SUPABASE_JWT_AUDIENCE` | Default `{url}/auth/v1` and `authenticated`               |
| `CLAWQL_SUPABASE_ANON_KEY`                                    | Auth REST (browser/server signup helpers)                 |
| `CLAWQL_SUPABASE_SERVICE_ROLE_KEY`                            | Admin delete of the Auth user (cascade)                   |
| `CLAWQL_ACCOUNT_DELETE_MAX_AUTH_AGE_SECONDS`                  | Recent-auth window for deletion (default 300)             |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | clawql.com browser signup                                 |

Instance CRD: `spec.supabase.enabled: true` (horizontal tier).

JWT verify checks issuer, audience, expiry, and role. Privileged account operations (checkout, deletion) **reject** anonymous-role tokens.

**None.** Session JWTs must never enter agent context. Checkout and session verify stay on clawql.com / CPC (HTTP), not MCP. Agents are never issued `supabase_verify_session` or `supabase_checkout_handoff` (also listed in `AGENT_NEVER_ISSUED_CAPABILITIES`).

JWKS getters are **cached per URL**. jose refetches on an unknown `kid` (key rotation) and rate-limits those refetches with `cooldownDuration` (default 30s). Do not construct a new remote JWKS set on every verify.

Account deletion also requires a **recent sign-in**: `amr[].timestamp`, else `auth_time`, else `iat`, must be within `CLAWQL_ACCOUNT_DELETE_MAX_AUTH_AGE_SECONDS` (default **300**). Older sessions get **403** `reauthentication required`.

## Identities

Do **not** key tenants as `supabase:{id}`. Each human gets an internal ClawQL user id (`usr_…`) in `IdentityStoreService` (`$CLAWQL_HOME/Auth/identities.json`) with linked identities (`supabase:…`, later `okta:…` / `entra:…`). CPC `ownerMemberTenantId` is that `usr_…` id.

## Checkout

- The checkout HTTP body must **not** accept `supabaseUserId`. Derive the subject from a verified `Authorization: Bearer` access token.
- Provision orgs **only** from Stripe's signed `checkout.session.completed` webhook (never the browser success redirect).
- Persist `stripeCheckoutSessionId` on the org and skip API-key re-issue on webhook retry so a replay cannot create two orgs or two keys.

## Account deletion

Deletion is a **resumable job** across five systems so a mid-cascade outage cannot leave an account half-deleted with no way to retry.

`POST /payments/account/delete` (privileged JWT **and** recent sign-in) creates or continues a job. `POST /payments/account/delete/resume` with an unguessable `jobId` (`adj_…`) continues the same job after the IdP user is already gone.

Steps, in this order (Supabase last so a still-valid JWT can retry until the IdP row is removed):

1. Revoke issued API keys for the ClawQL user
2. Delete provisioned orgs (credits store)
3. Delete the Stripe customer
4. Crypto-shred matching vault notes (existing memory erase — WORM `pathId` / content hash)
5. Delete the Supabase Auth user (service role; 404 is success)

Each step is recorded (`pending` / `completed` / `skipped` / `failed`) and retried **idempotently**. The identity record is removed only after all five succeed. WORM `ACCOUNT_DELETED` stores **hashed** user / org / Supabase subject / Stripe customer references and is written **once**, only after every step has completed.

The plugin skill is **operator-only** (`audience: "operator"`) and is omitted from agents' default `skills_list`. Vault seed must not contain project URLs or keys.

## Customer-facing Supabase (separate product)

If agents should work with **users'** Supabase projects, that is an ordinary **source**, not this signup plugin. Describe the Management API and each project's REST endpoint as OpenAPI. Spec-derived risk then applies automatically: reads allowed, writes needing a mandate, deletes blocked.

## Non-goals

- Hosting MCP, WORM, or vault in Supabase
- Replacing enterprise SSO / customer IdP for company orgs (those become additional linked identities)
- Minting ClawQL API keys from Supabase JWTs
- MCP tools for session verify or checkout handoff
