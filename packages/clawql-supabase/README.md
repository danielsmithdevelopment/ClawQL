# clawql-supabase

Supabase Auth **provider plugin** for managed ClawQL account signup on clawql.com.

ClawQL remains an **OIDC consumer** for MCP runtime auth and still issues API keys via
`IssuedApiKeyStore` after Stripe → `provisionOrg`. This package is the **human account**
layer in front of that spine:

```
Supabase Auth (signup/login)
  → Stripe Checkout (CPC metadata + clawql_supabase_user_id)
  → provisionOrg
  → ClawQL API key (shown once)
```

## Enable

```bash
export CLAWQL_ENABLE_SUPABASE=1
export CLAWQL_SUPABASE_URL=https://xxxx.supabase.co
# Server JWT verify (prefer one):
export CLAWQL_SUPABASE_JWT_SECRET=…          # legacy HS256 JWT secret
# or
export CLAWQL_SUPABASE_JWKS_URL=https://xxxx.supabase.co/auth/v1/.well-known/jwks.json
```

Optional Auth REST (server-side signup helpers):

```bash
export CLAWQL_SUPABASE_ANON_KEY=…
```

## MCP surface

**None.** This plugin is CPC / clawql.com middleware. Session JWTs stay on the account host; agents never see them. Do not register `supabase_verify_session` or `supabase_checkout_handoff`.

## clawql.com

Set public env on the marketing site:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
```

When set, `/signup` prefers the Supabase account form (then Checkout when self-serve is configured);
otherwise it keeps the FormSubmit waitlist.

## Non-goals

- Not an MCP/WORM host
- Does not mint ClawQL API keys
- Does not replace enterprise SSO (WorkOS / customer IdP) for company orgs
