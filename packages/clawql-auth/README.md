# clawql-auth

Gateway authentication, **issued API keys** (org/team), outbound OAuth token refresh, and shared step-up primitives for the Agentic Gateway.

**ClawQL is not an IdP.** Human SSO, account recovery, and phishing-resistant MFA stay with the customer’s identity provider. This package **consumes** IdP tokens, **issues and validates** ClawQL API keys, maps them to ATR claims, and provides reusable step-up helpers for high-impact tools (e.g. payments).

## Modes

| `CLAWQL_AUTH_MODE` | Behavior                                                         |
| ------------------ | ---------------------------------------------------------------- |
| `noAuth` (default) | Permissive admin ATR claims (local / solo)                       |
| `apiKey`           | Static `CLAWQL_API_KEY` and/or issued `cqk_…` keys / VK resolver |
| `oidc`             | Verify IdP-issued Bearer JWT (JWKS / PEM / HS256-dev) → ATR      |

## Issued API keys (enterprise / team management)

Prefer issued keys over a single shared env secret when multiple teams or machines need access:

```ts
import { createClawQLAuth } from "clawql-auth";

const auth = createClawQLAuth({
  mode: "apiKey",
  apiKeyStorePath: `${process.env.CLAWQL_HOME}/Auth/api-keys.json`,
});

const { secret, record } = await auth.apiKeys!.issue({
  subjectId: "alice@acme.com",
  orgId: "acme",
  teamId: "platform",
  role: "operator",
  scope: ["execute", "search", "memory"],
  label: "ci-runner",
});
// `secret` shown once — format `cqk_<id>_<random>`; only salted hash is stored.

const check = auth.resolveClaims({ "x-api-key": secret });
// → ATR claims with orgId / virtualKeyId / scope
```

- **Issue / validate / revoke / listActive** live in `IssuedApiKeyStore`
- Gateway wires `asClaimsResolver()` automatically when `apiKeyStorePath` is set
- Optional `authEventSink` for WORM (`API_KEY_ISSUED` / `USED` / `REVOKED` / `INVALID`)

## Outbound OAuth token store

Mutex-protected proactive refresh (60s before expiry) — one refresh per token key even under concurrent agent sessions:

```ts
import {
  createOAuthTokenStore,
  createMemoryOAuthPersistence,
  ClientCredentialsFlow,
  createAuthorizationCodeFlow,
  createMCPOAuthServer,
} from "clawql-auth";

const store = createOAuthTokenStore({
  persistence: createMemoryOAuthPersistence(),
  refresh: async (_key, _current) => {
    return { accessToken: "…", refreshToken: "…", expiresAtMs: Date.now() + 3600_000 };
  },
});

const token = await store.getValidToken("acme:google:alice");
```

Also shipped: **`ClientCredentialsFlow`**, **`AuthorizationCodeFlow` (PKCE)**, provider catalogs (Google/Microsoft/Slack), **`OutboundAPIKeyManager`**, and inbound **`MCPOAuthServer`** (client_credentials + refresh rotation). HTTP `/oauth/token` wiring into `server-http` / `mcp-api-adapter` is the next host integration step.

See [`docs/security/clawql-auth-package-spec.md`](../../docs/security/clawql-auth-package-spec.md).

## Environment

| Variable                                 | Purpose                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| `CLAWQL_AUTH_MODE`                       | `noAuth` \| `apiKey` \| `oidc`                            |
| `CLAWQL_API_KEY`                         | Bootstrap when mode is `apiKey` (unless VK / issued keys) |
| `CLAWQL_PROVIDER_AUTH_JSON`              | Per-provider upstream headers for `execute`               |
| `CLAWQL_AUTH_OIDC_JWKS_URL`              | OIDC JWKS URL (RS256)                                     |
| `CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH`   | PEM public key path (RS256)                               |
| `CLAWQL_AUTH_OIDC_HS256_SECRET`          | **Tests/dev only** HS256 secret                           |
| `CLAWQL_AUTH_OIDC_ISSUER`                | Optional `iss` check                                      |
| `CLAWQL_AUTH_OIDC_AUDIENCE`              | Optional `aud` (comma-separated)                          |
| `CLAWQL_AUTH_OIDC_ATR_CLAIM`             | Claim holding ATR object (default `atr`)                  |
| `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS` | Company SSO allowlist (`acme.com,acme.co.uk`)             |
| `CLAWQL_AUTH_OIDC_REQUIRE_EMAIL_DOMAIN`  | Force email/hd even without allowlist                     |
| `CLAWQL_AUTH_OIDC_EMAIL_CLAIM`           | Email claim name (default `email`)                        |
| `CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL`  | Require MFA-class `acr`/`amr` for financial MCP tools     |
| `CLAWQL_AUTH_FINANCIAL_TOOLS`            | Override financial tool name list (comma-separated)       |

## Per-org IdP routing (multi-tenant)

For SaaS with one IdP per company, inject an `OrgIdpRouter` (e.g. from `createOrgCreditsIdpRouter` in `clawql-payments`) and call `verifyOidcBearerTokenWithOrgRouting`. The router selects JWKS/issuer/domains from the JWT email domain (or `iss`). ClawQL still does **not** issue login tokens.

## Step-up (not SSO)

The public API is **Effect-first**: functions return `Effect`, and services/Layers are used for DI.
Hosts run the effects with `Effect.runSync` / `Effect.runPromise` at their own boundary.

```ts
import { Effect } from "effect";
import { createClawQLAuth, createStepUpStoreLayer, StepUpStoreService } from "clawql-auth";

const auth = createClawQLAuth({ mode: "oidc", stepUpStorePath: "/path/step-up.json" });

const claims = await auth.resolveClaimsAsync({ authorization: `Bearer ${jwt}` });
if (claims.ok) {
  await Effect.runPromise(
    auth.assertToolAccessEffect(claims.claims, "payments_credits_transfer_confirm")
  );
}
```

WebAuthn is a **pluggable** `WebAuthnStepUpVerifier` (fails closed until injected). Prefer IdP passkeys for human login.

**Face ID / Touch ID / Windows Hello** and **YubiKey / Titan** are the same WebAuthn surface — platform vs roaming authenticators. ClawQL never sees biometric bytes; keys stay in Secure Enclave / TPM / the hardware token.

```ts
import { buildPasskeyAuthenticatorSelection } from "clawql-auth";

// Default: browser offers biometrics *and* hardware keys
buildPasskeyAuthenticatorSelection();

// Enterprise: force YubiKey / FIDO2 roaming only
buildPasskeyAuthenticatorSelection({ requirement: "hardware-only" });

// Device biometric only (Face ID / Touch ID / Windows Hello)
buildPasskeyAuthenticatorSelection({ requirement: "biometric-only" });
```

## Related

- MCP proxy JWT ATR (mesh / Panguard): [`docs/security/mcp-proxy-jwt-atr.md`](../../docs/security/mcp-proxy-jwt-atr.md)
- OIDC consumer + step-up: [`docs/security/clawql-auth-oidc-stepup.md`](../../docs/security/clawql-auth-oidc-stepup.md)
- OAuth / issued-keys package roadmap: [`docs/security/clawql-auth-package-spec.md`](../../docs/security/clawql-auth-package-spec.md)
- Payments P2P step-up: [`docs/payments/credits-ach.md`](../../docs/payments/credits-ach.md)
