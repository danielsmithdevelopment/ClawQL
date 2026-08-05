# clawql-auth: OIDC consumer + shared step-up

**Status:** shipped in `clawql-auth` (gateway `oidc` mode, policy hooks, TOTP/WebAuthn interfaces).  
**Non-goal:** ClawQL does **not** become a full IdP (no login UI, user directory, or token issuance).

## Layering

```
Customer IdP (Okta / Entra / Auth0 / …)
        │  issues JWT (optional acr/amr for MFA)
        ▼
Istio / Panguard / mcp-proxy JWT ATR   ← optional mesh chokepoint
        │
        ▼
clawql-mcp-http  CLAWQL_AUTH_MODE=oidc  ← clawql-auth verifies JWT → ATR
        │
        ▼
High-impact tools (payments, …)
  • assertToolPolicy(claims, tool)     ← MFA gate for financial tools
  • createFileStepUpStore + TOTP       ← transaction step-up (not SSO)
```

Login MFA and phishing-resistant passkeys remain **IdP** concerns. Payments still use **stage → confirm** plus optional TOTP for “move money now.”

## Gateway OIDC

Set:

```bash
export CLAWQL_AUTH_MODE=oidc
export CLAWQL_AUTH_OIDC_JWKS_URL=https://idp.example.com/.well-known/jwks.json
export CLAWQL_AUTH_OIDC_ISSUER=https://idp.example.com
export CLAWQL_AUTH_OIDC_AUDIENCE=clawql-mcp
# optional claim mapping
export CLAWQL_AUTH_OIDC_ATR_CLAIM=atr
```

Bearer JWT on MCP HTTP routes is verified asynchronously (`resolveAtrClaimsFromHeadersAsync`). Prefer an embedded `atr` object; otherwise flat `sub` / `role` / `scope` / `tenant_id` plus OIDC `acr` / `amr` are mapped into `AtrClaims`.

Dev-only: `CLAWQL_AUTH_OIDC_HS256_SECRET` (never production).

This complements — and does not replace — [`mcp-proxy-jwt-atr.md`](./mcp-proxy-jwt-atr.md) when Panguard/Istio already validate every request.

## Policy: MFA for financial tools

```bash
export CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL=1
# optional override list:
# export CLAWQL_AUTH_FINANCIAL_TOOLS=payments_credits_transfer_confirm,payments_payout_create
```

```ts
import { assertToolPolicy, claimsHaveMfa } from "clawql-auth";

assertToolPolicy(claims, "payments_credits_transfer_confirm");
```

`claimsHaveMfa` treats common `acr` / `amr` hints (`mfa`, `otp`, `totp`, ACR level ≥ 2, etc.).

Hosts should call `assertToolPolicy` when dispatching MCP tools once request ATR claims are available. Full claim threading into every tool handler is a follow-up.

## Shared step-up

| Primitive             | Module                        | Notes                             |
| --------------------- | ----------------------------- | --------------------------------- |
| TOTP (RFC 6238)       | `clawql-auth` `step-up/totp`  | Used by `clawql-payments` credits |
| File enrollment store | `createFileStepUpStore(path)` | Caller-owned path; mode `0600`    |
| WebAuthn              | `WebAuthnStepUpVerifier`      | Pluggable; default fails closed   |

Payments path: `$CLAWQL_HOME/Payments/step-up-totp.json` via `clawql payments credits step-up enroll`. Secrets never go in payment WORM.

## `createClawQLAuth`

```ts
import { createClawQLAuth } from "clawql-auth";

const auth = createClawQLAuth({
  mode: "oidc",
  stepUpStorePath: process.env.CLAWQL_STEP_UP_PATH,
});
const result = await auth.resolveClaimsAsync(req.headers);
if (result.ok) {
  auth.assertToolAccess(result.claims, "payments_credits_transfer_confirm");
}
```

## Explicitly out of scope

- SAML / LDAP protocol servers (roadmap may add **client** modes later)
- User registration, password reset, email OTP delivery
- Replacing Okta / Entra / Auth0

See also: [`clawql-defense-in-depth-security-guide.md`](./clawql-defense-in-depth-security-guide.md), package README [`packages/clawql-auth/README.md`](../../packages/clawql-auth/README.md).
