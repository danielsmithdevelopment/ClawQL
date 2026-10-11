# clawql-supabase

Supabase Auth **middleware** for managed ClawQL account signup on clawql.com.

This package has **no MCP surface**. Session verification and Checkout handoff are
server-side account plumbing (CPC + clawql.com). Agents hold capabilities, never
credentials — session JWTs must not enter an agent context.

ClawQL remains an **OIDC consumer** for MCP runtime auth and still issues API keys via
`IssuedApiKeyStore` after Stripe → `provisionOrg`:

```
Supabase Auth (signup/login)
  → Stripe Checkout (CPC metadata + clawql_user_id)
  → signed checkout.session.completed webhook (idempotent provisionOrg)
  → ClawQL API key (shown once)
```

## Enable

```bash
export CLAWQL_ENABLE_SUPABASE=1
export CLAWQL_SUPABASE_URL=https://xxxx.supabase.co
# JWKS (default — asymmetric). Derived from URL when unset:
export CLAWQL_SUPABASE_JWKS_URL=https://xxxx.supabase.co/auth/v1/.well-known/jwks.json
# Optional HS256 fallback only (widens who can forge sessions if leaked):
# export CLAWQL_SUPABASE_JWT_SECRET=…
export CLAWQL_SUPABASE_JWT_AUDIENCE=authenticated
```

Optional Auth REST (server-side signup helpers) and account deletion:

```bash
export CLAWQL_SUPABASE_ANON_KEY=…
export CLAWQL_SUPABASE_SERVICE_ROLE_KEY=…   # admin delete only
```

## MCP surface

**None.** This plugin is CPC / clawql.com middleware. Session JWTs stay on the account host; agents never see them. Do not register `supabase_verify_session` or `supabase_checkout_handoff`.

## CPC Checkout

`POST /payments/checkout/session` (self-serve) requires `Authorization: Bearer <supabase JWT>`
when this plugin is enabled. The server:

1. Verifies the JWT (JWKS, issuer/audience/expiry/role; rejects `anon`)
2. Resolves or creates an internal ClawQL user (`usr_…`) with linked identity `supabase:{sub}`
3. Puts `clawql_user_id` on Stripe metadata — **never** accepts `supabaseUserId` from the client
4. Provisions only from Stripe's signed `checkout.session.completed` webhook (idempotent)

Account deletion (`POST /payments/account/delete`) is a resumable per-step job and requires a recent sign-in (default 5 minutes). Resume with `POST /payments/account/delete/resume` and the returned `jobId` if the IdP user is already gone. `ACCOUNT_DELETED` is written once, after keys, org, Stripe, vault, and Supabase all complete.

The plugin skill is for operators (`audience: "operator"`) and is omitted from agents' default `skills_list`. Vault seed does not store project URLs or keys.

## clawql.com

Set public env on the marketing site:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
```

When set, `/signup` prefers the Supabase account form (then Checkout when self-serve is configured);
otherwise it keeps the FormSubmit waitlist.

## Customer-facing Supabase (separate product)

Using Supabase as a **source** so agents can work with _users'_ Supabase projects is not
this plugin. Describe the Management API and each project's REST endpoint as OpenAPI; spec-derived
risk then applies (reads allowed, writes needing a mandate, deletes blocked).

## Non-goals

- Not an MCP/WORM host
- Does not mint ClawQL API keys
- Does not register MCP tools
- Does not replace enterprise SSO (Okta / Entra / WorkOS) — those become additional linked identities on the same `usr_…`
