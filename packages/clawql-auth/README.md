# clawql-auth

Gateway authentication and shared step-up primitives for the Agentic Gateway.

**ClawQL is not an IdP.** Human SSO, account recovery, and phishing-resistant MFA stay with the customer’s identity provider. This package **consumes** IdP tokens, maps them to ATR claims, and provides reusable step-up helpers for high-impact tools (e.g. payments).

## Modes

| `CLAWQL_AUTH_MODE` | Behavior                                                     |
| ------------------ | ------------------------------------------------------------ |
| `noAuth` (default) | Permissive admin ATR claims (local / solo)                   |
| `apiKey`           | Static `CLAWQL_API_KEY` and/or injected virtual-key resolver |
| `oidc`             | Verify IdP-issued Bearer JWT (JWKS / PEM / HS256-dev) → ATR  |

## Environment

| Variable                                 | Purpose                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `CLAWQL_AUTH_MODE`                       | `noAuth` \| `apiKey` \| `oidc`                           |
| `CLAWQL_API_KEY`                         | Required when mode is `apiKey` (unless VK resolver only) |
| `CLAWQL_PROVIDER_AUTH_JSON`              | Per-provider upstream headers for `execute`              |
| `CLAWQL_AUTH_OIDC_JWKS_URL`              | OIDC JWKS URL (RS256)                                    |
| `CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH`   | PEM public key path (RS256)                              |
| `CLAWQL_AUTH_OIDC_HS256_SECRET`          | **Tests/dev only** HS256 secret                          |
| `CLAWQL_AUTH_OIDC_ISSUER`                | Optional `iss` check                                     |
| `CLAWQL_AUTH_OIDC_AUDIENCE`              | Optional `aud` (comma-separated)                         |
| `CLAWQL_AUTH_OIDC_ATR_CLAIM`             | Claim holding ATR object (default `atr`)                 |
| `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS` | Company SSO allowlist (`acme.com,acme.co.uk`)            |
| `CLAWQL_AUTH_OIDC_REQUIRE_EMAIL_DOMAIN`  | Force email/hd even without allowlist                    |
| `CLAWQL_AUTH_OIDC_EMAIL_CLAIM`           | Email claim name (default `email`)                       |
| `CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL`  | Require MFA-class `acr`/`amr` for financial MCP tools    |
| `CLAWQL_AUTH_FINANCIAL_TOOLS`            | Override financial tool name list (comma-separated)      |

## Per-org IdP routing (multi-tenant)

For SaaS with one IdP per company, inject an `OrgIdpRouter` (e.g. from `createOrgCreditsIdpRouter` in `clawql-payments`) and call `verifyOidcBearerTokenWithOrgRouting`. The router selects JWKS/issuer/domains from the JWT email domain (or `iss`). ClawQL still does **not** issue login tokens.

## Step-up (not SSO)

```ts
import {
  createClawQLAuth,
  createFileStepUpStore,
  generateTotp,
  assertToolPolicy,
} from "clawql-auth";

const auth = createClawQLAuth({ mode: "oidc", stepUpStorePath: "/path/step-up.json" });
const claims = await auth.resolveClaimsAsync({ authorization: `Bearer ${jwt}` });
if (claims.ok) auth.assertToolAccess(claims.claims, "payments_credits_transfer_confirm");

// Shared TOTP — payments uses the same primitives under $CLAWQL_HOME/Payments/
const store = createFileStepUpStore("/path/step-up.json");
await store.enroll({ subjectId: "tenant-a", issuer: "ClawQL" });
```

WebAuthn is a **pluggable** `WebAuthnStepUpVerifier` (fails closed until injected). Prefer IdP passkeys for human login.

## Composition

```ts
import { createClawQLAuth } from "clawql-auth";

const auth = createClawQLAuth({ mode: "noAuth" });
// or apiKey / oidc — see docs/security/clawql-auth-oidc-stepup.md
```

## Related

- MCP proxy JWT ATR (mesh / Panguard): [`docs/security/mcp-proxy-jwt-atr.md`](../../docs/security/mcp-proxy-jwt-atr.md)
- Payments P2P step-up: [`docs/payments/credits-ach.md`](../../docs/payments/credits-ach.md)
- Design: modularization §4.3
