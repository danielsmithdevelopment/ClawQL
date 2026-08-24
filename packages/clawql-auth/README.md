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

## SecretStore (pluggable backends)

One interface — swap SQLite (default), OpenBao, HashiCorp Vault, Infisical, Vaultwarden, 1Password, or env without touching OAuth / API-key code:

```ts
import {
  createClawQLAuth,
  createSQLiteSecretStore,
  createOpenBaoStore,
  createHashiCorpVaultStore,
  createInfisicalStore,
  resolveSecretStore,
} from "clawql-auth";

// Homelab / Hermes default
const auth = createClawQLAuth({
  secretStore: createSQLiteSecretStore({ path: "~/.clawql/secrets.db" }),
});

// Prefer OpenBao for OSS self-host (Vault-compatible, Apache 2.0)
createClawQLAuth({
  secretStore: createOpenBaoStore({
    endpoint: process.env.BAO_ADDR!,
    token: process.env.BAO_TOKEN!,
  }),
});

// Or resolve from CLAWQL_SECRET_STORE=openbao|hashicorp-vault|infisical|…
createClawQLAuth({ secretStore: resolveSecretStore() });
```

| Backend                             | Role                                               |
| ----------------------------------- | -------------------------------------------------- |
| SQLite                              | Local / homelab / Hermes                           |
| OpenBao                             | Self-hosted OSS TEE (preferred over HashiCorp BSL) |
| HashiCorp Vault                     | Enterprise already on Vault                        |
| Infisical / 1Password / Vaultwarden | Customer-owned secret managers                     |
| env                                 | CI only                                            |

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

Also shipped: **`ClientCredentialsFlow`**, **`AuthorizationCodeFlow` (PKCE)**, provider catalogs (Google/Microsoft/Slack), **`OutboundAPIKeyManager`**, and inbound **`MCPOAuthServer`** with **EMA / ID-JAG** (`id_jag` grant). Enable on the MCP HTTP host with `CLAWQL_MCP_OAUTH_ENABLED=1` — see environment table below.

## Inbound MCP OAuth + EMA (Enterprise-Managed Authorization)

When `CLAWQL_MCP_OAUTH_ENABLED=1`, `server-http` exposes:

- `POST /oauth/token` — `client_credentials`, `refresh_token`, and ID-JAG (`urn:ietf:params:oauth:grant-type:jwt-bearer`)
- `GET /.well-known/oauth-authorization-server` — discovery with `token_endpoint`
- `PUT/GET/DELETE /oauth/ema/orgs/:orgId` — admin API (requires `CLAWQL_API_KEY`)

EMA org config (IdP JWKS + group→scope mappings) persists in **SecretStore** (`ema-orgs/{orgId}`). Bootstrap from `CLAWQL_EMA_ORGS_JSON` or `CLAWQL_EMA_ORGS_PATH`. Every successful token issue appends **`MCP_TOKEN_ISSUED`** to a hash-chained auth WORM log (SQLite by default via `createAuthEventSinkFromEnv`).

Okta shorthand:

```json
{
  "orgs": [
    {
      "provider": "okta",
      "orgId": "acme",
      "oktaDomain": "acme.okta.com",
      "audience": "https://mcp.example.com/",
      "groupMappings": [{ "idpGroup": "engineering", "scope": ["execute", "search", "memory"] }]
    }
  ]
}
```

Set `CLAWQL_AUTH_MODE=mcpOAuth` to accept only ClawQL-issued MCP JWTs, or keep `apiKey`/`oidc` — when MCP OAuth is enabled, issued bearer tokens are accepted in **hybrid** mode automatically on `server-http`.

See [`docs/security/clawql-auth-package-spec.md`](../../docs/security/clawql-auth-package-spec.md).

## Environment

| Variable                                 | Purpose                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| `CLAWQL_AUTH_MODE`                       | `noAuth` \| `apiKey` \| `oidc` \| `mcpOAuth`               |
| `CLAWQL_API_KEY`                         | Bootstrap when mode is `apiKey` (unless VK / issued keys)  |
| `CLAWQL_PROVIDER_AUTH_JSON`              | Per-provider upstream headers for `execute`                |
| `CLAWQL_AUTH_OIDC_JWKS_URL`              | OIDC JWKS URL (RS256)                                      |
| `CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH`   | PEM public key path (RS256)                                |
| `CLAWQL_AUTH_OIDC_HS256_SECRET`          | **Tests/dev only** HS256 secret                            |
| `CLAWQL_AUTH_OIDC_ISSUER`                | Optional `iss` check                                       |
| `CLAWQL_AUTH_OIDC_AUDIENCE`              | Optional `aud` (comma-separated)                           |
| `CLAWQL_AUTH_OIDC_ATR_CLAIM`             | Claim holding ATR object (default `atr`)                   |
| `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS` | Company SSO allowlist (`acme.com,acme.co.uk`)              |
| `CLAWQL_AUTH_OIDC_REQUIRE_EMAIL_DOMAIN`  | Force email/hd even without allowlist                      |
| `CLAWQL_AUTH_OIDC_EMAIL_CLAIM`           | Email claim name (default `email`)                         |
| `CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL`  | Require MFA-class `acr`/`amr` for financial MCP tools      |
| `CLAWQL_AUTH_FINANCIAL_TOOLS`            | Override financial tool name list (comma-separated)        |
| `CLAWQL_MCP_OAUTH_ENABLED`               | Enable inbound MCP OAuth AS on HTTP hosts                  |
| `CLAWQL_MCP_OAUTH_SIGNING_SECRET`        | HS256 secret for issued MCP access JWTs (dev / single-node) |
| `CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM` | RS256 PKCS#8 private key PEM (production — preferred)     |
| `CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH` | Path to RS256 private key PEM                        |
| `CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM_PATH`  | Optional verify-only public key (defaults to private) |
| `CLAWQL_MCP_OAUTH_SIGNING_KEY_ID`        | Optional `kid` for RS256 tokens and JWKS                   |
| `CLAWQL_MCP_OAUTH_ISSUER`                | Token `iss` (default `CLAWQL_PUBLIC_ORIGIN`)               |
| `CLAWQL_MCP_OAUTH_RESOURCE_AUDIENCE`     | ID-JAG `aud` when org config omits audience                |
| `CLAWQL_MCP_OAUTH_CLIENTS_JSON`          | Bootstrap registered MCP clients (JSON)                    |
| `CLAWQL_MCP_OAUTH_CLIENTS_PATH`          | File path for MCP client registry JSON                     |
| `CLAWQL_EMA_ORGS_JSON`                   | Bootstrap EMA org configs (JSON) into SecretStore          |
| `CLAWQL_EMA_ORGS_PATH`                   | File path for EMA org configs JSON                         |
| `CLAWQL_AUTH_AUDIT_STORE`                | Auth WORM backend: `sqlite` (default) \| `memory` \| `off` |
| `CLAWQL_AUTH_AUDIT_PATH`                 | SQLite path (default `$CLAWQL_HOME/auth-audit.db`)         |

Setting `CLAWQL_AUTH_AUDIT_STORE=off` while MCP OAuth is enabled logs a **SECURITY WARNING** at `server-http` boot — auth is live but issuance is not persisted.

Setting `CLAWQL_AUTH_AUDIT_STORE=off` while MCP OAuth is enabled logs a **SECURITY WARNING** at `server-http` boot — auth is live but issuance is not persisted.

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
