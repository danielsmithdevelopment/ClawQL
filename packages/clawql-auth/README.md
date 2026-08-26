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
import { Effect } from "effect";

const auth = createClawQLAuth({
  mode: "apiKey",
  apiKeyStorePath: `${process.env.CLAWQL_HOME}/Auth/api-keys.json`,
});

const { secret, record } = await Effect.runPromise(
  auth.apiKeys!.issue({
    subjectId: "alice@acme.com",
    orgId: "acme",
    teamId: "platform",
    role: "operator",
    scope: ["execute", "search", "memory"],
    label: "ci-runner",
  })
);
// `secret` shown once — format `cqk_<id>_<random>`; only salted hash is stored.

const check = auth.resolveClaims({ "x-api-key": secret });
// → ATR claims with orgId / virtualKeyId / scope
```

- **Issue / validate / revoke / listActive** live in `IssuedApiKeyStore` — Effect-primary; run with `Effect.runPromise` (or `IssuedApiKeyStoreService` + `createIssuedApiKeyStoreLayer` for `Effect.provide`)
- Gateway wires `asClaimsResolver()` automatically when `apiKeyStorePath` is set (stays a synchronous façade for `gateway.ts`'s sync host boundary)
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

- `POST /oauth/token` — `client_credentials`, `refresh_token`, `authorization_code` (+ PKCE S256), and ID-JAG (`urn:ietf:params:oauth:grant-type:jwt-bearer`). Client auth: `client_secret_post` or `Authorization: Basic`.
- `POST /oauth/revoke` — RFC 7009-style refresh **or** access-token revocation (`MCP_TOKEN_REVOKED`; access JWTs use hash denylist)
- `GET /oauth/authorize` — interactive auth-code start (requires already-authenticated gateway identity: API key / OIDC / MCP JWT). ClawQL is **not** a login IdP.
- `GET /.well-known/oauth-authorization-server` — discovery with `token_endpoint` / `revocation_endpoint` (+ `authorization_endpoint` / `code_challenge_methods_supported` when auth-code is live)
- `PUT/GET/DELETE /oauth/ema/orgs/:orgId` — EMA org admin (**`CLAWQL_API_KEY`** or ATR claims with `role=admin` / scope `ema:admin`, including issued `cqk_` keys via `CLAWQL_API_KEYS_PATH`)
- `PUT/GET/DELETE /oauth/ema/clients/:clientId` — MCP client registry admin (same auth as EMA orgs)

EMA org config (IdP JWKS + group→scope mappings) persists in **SecretStore** (`ema-orgs/{orgId}`). Bootstrap from `CLAWQL_EMA_ORGS_JSON` or `CLAWQL_EMA_ORGS_PATH` (set `CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT=1` to fail boot on bad JSON). Every successful token issue appends **`MCP_TOKEN_ISSUED`** (with `accessTokenHash`) to a hash-chained auth WORM log. Token/authorize/revoke/id-jag routes are rate-limited (`CLAWQL_MCP_OAUTH_RATE_LIMIT_PER_MIN`, default 120).

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

Auth0 Resource App AS preset (`buildAuth0EmaOrgConfig`):

```typescript
import { buildAuth0EmaOrgConfig } from "clawql-auth";

buildAuth0EmaOrgConfig({
  orgId: "acme",
  auth0Domain: "acme.us.auth0.com",
  audience: "https://mcp.example.com/",
  groupMappings: [{ idpGroup: "engineering", scope: ["execute", "search", "memory"] }],
});
```

### Enterprise XAA runbook (Cross App Access)

Three roles — see spec §4.1.1:

| Role            | Who                        | ClawQL                                                         |
| --------------- | -------------------------- | -------------------------------------------------------------- |
| Requesting App  | Claude, Cursor, agent host | Not clawql-auth                                                |
| Enterprise IdP  | Okta / Auth0 XAA policy    | Optional self-hosted issuer (`CLAWQL_ID_JAG_ISSUER_ENABLED=1`) |
| Resource App AS | MCP gateway token endpoint | **Default** — `POST /oauth/token` jwt-bearer grant             |

**Resource-App-only (typical):**

1. Configure Okta/Auth0 XAA policy: Requesting App → ClawQL MCP audience
2. Bootstrap EMA org: IdP JWKS + issuer + group→scope mappings (`CLAWQL_EMA_ORGS_JSON` or admin API)
3. Requesting App obtains ID-JAG from IdP, exchanges at `POST /oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
4. MCP calls use returned access JWT; Panguard enforces ATR from `atr` claim

**SAML enterprises:** SAML→refresh→ID-JAG happens at IdP + Requesting App only. ClawQL verifies finished ID-JAG JWTs (OIDC JWKS presets).

**Smoke test:** `npm run build -w clawql-auth && node scripts/dev/xaa-smoke.mjs`

**Dual audit:** `CLAWQL_AUTH_AUDIT_STORE` (per-auth SQLite WORM) + optional `CLAWQL_WORM_ENABLED=1` process trail — host composes via `resolveHostAuthEventSink()` in `src/auth-process-worm-sink.ts` (`createAuthEventWormSink` from `clawql-audit`).

Set `CLAWQL_AUTH_MODE=mcpOAuth` to accept only ClawQL-issued MCP JWTs, or keep `apiKey`/`oidc` — when MCP OAuth is enabled, issued bearer tokens are accepted in **hybrid** mode automatically on `server-http`.

### Self-hosted ID-JAG issuer (ClawQL as EMA IdP)

For air-gapped / regulated deployments without Okta Cross App Access — a self-hosted path to EMA without third-party session-token custody:

1. Enable with `CLAWQL_ID_JAG_ISSUER_ENABLED=1` + `CLAWQL_ID_JAG_ISSUER_ORG_ID`
2. Prefer a **dedicated** RS256 key via `CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH` (do not share the MCP OAuth AS key in production — compromise of one must not forge the other)
3. Admin: `PUT /oauth/ema/connectors/:orgId/:connectorId` (audience = MCP resource origin)
4. Issue: `POST /oauth/id-jag/issue` with `{ orgId, subjectId, connectorId, groups }`
5. Consumers verify via `GET /.well-known/id-jag-jwks.json?orgId=…` then exchange at `/oauth/token`

Audit: `ID_JAG_ASSERTION_ISSUED.jti` correlates with `MCP_TOKEN_ISSUED.idJagJti` so issuance → session is one reviewable chain.

See [`docs/security/clawql-auth-package-spec.md`](../../docs/security/clawql-auth-package-spec.md) §4.1.2 ([#961](https://github.com/danielsmithdevelopment/ClawQL/pull/961)).

## Environment

| Variable                                        | Purpose                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `CLAWQL_AUTH_MODE`                              | `noAuth` \| `apiKey` \| `oidc` \| `mcpOAuth`                                             |
| `CLAWQL_API_KEY`                                | Bootstrap when mode is `apiKey` (unless VK / issued keys)                                |
| `CLAWQL_PROVIDER_AUTH_JSON`                     | Per-provider upstream headers for `execute`                                              |
| `CLAWQL_AUTH_OIDC_JWKS_URL`                     | OIDC JWKS URL (RS256)                                                                    |
| `CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH`          | PEM public key path (RS256)                                                              |
| `CLAWQL_AUTH_OIDC_HS256_SECRET`                 | **Tests/dev only** HS256 secret                                                          |
| `CLAWQL_AUTH_OIDC_ISSUER`                       | Optional `iss` check                                                                     |
| `CLAWQL_AUTH_OIDC_AUDIENCE`                     | Optional `aud` (comma-separated)                                                         |
| `CLAWQL_AUTH_OIDC_ATR_CLAIM`                    | Claim holding ATR object (default `atr`)                                                 |
| `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS`        | Company SSO allowlist (`acme.com,acme.co.uk`)                                            |
| `CLAWQL_AUTH_OIDC_REQUIRE_EMAIL_DOMAIN`         | Force email/hd even without allowlist                                                    |
| `CLAWQL_AUTH_OIDC_EMAIL_CLAIM`                  | Email claim name (default `email`)                                                       |
| `CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL`         | Require MFA-class `acr`/`amr` for financial MCP tools                                    |
| `CLAWQL_AUTH_FINANCIAL_TOOLS`                   | Override financial tool name list (comma-separated)                                      |
| `CLAWQL_MCP_OAUTH_ENABLED`                      | Enable inbound MCP OAuth AS on HTTP hosts                                                |
| `CLAWQL_MCP_OAUTH`                              | Legacy alias for enabling MCP OAuth                                                      |
| `CLAWQL_MCP_OAUTH_SIGNING_SECRET`               | HS256 secret for issued MCP access JWTs (dev / single-node)                              |
| `CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM`      | Inline RS256 PKCS#8 private key PEM (production — preferred)                             |
| `CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH` | Path to RS256 private key PEM                                                            |
| `CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM`       | Optional inline verify-only public key                                                   |
| `CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM_PATH`  | Optional verify-only public key path (defaults to private)                               |
| `CLAWQL_MCP_OAUTH_SIGNING_KEY_ID`               | Optional `kid` for RS256 tokens and JWKS                                                 |
| `CLAWQL_MCP_OAUTH_ISSUER`                       | Token `iss` (default `CLAWQL_PUBLIC_ORIGIN`)                                             |
| `CLAWQL_MCP_OAUTH_RESOURCE_AUDIENCE`            | ID-JAG `aud` when org config omits audience                                              |
| `CLAWQL_MCP_OAUTH_AUDIENCE`                     | Alias for resource audience                                                              |
| `CLAWQL_MCP_OAUTH_TOKEN_TTL_SECONDS`            | Access token TTL (default 300)                                                           |
| `CLAWQL_MCP_OAUTH_REFRESH_TTL_SECONDS`          | Refresh token TTL (default 3600)                                                         |
| `CLAWQL_MCP_OAUTH_CLIENTS_JSON`                 | Bootstrap registered MCP clients (JSON)                                                  |
| `CLAWQL_MCP_OAUTH_CLIENTS_PATH`                 | File path for MCP client registry JSON                                                   |
| `CLAWQL_EMA_ORGS_JSON`                          | Bootstrap EMA org configs (JSON) into SecretStore                                        |
| `CLAWQL_EMA_ORGS_PATH`                          | File path for EMA org configs JSON                                                       |
| `CLAWQL_EMA_ORGS_FILE`                          | Alternate file path env for EMA org configs                                              |
| `CLAWQL_AUTH_AUDIT_STORE`                       | Auth WORM backend: `sqlite` (default) \| `memory` \| `off`                               |
| `CLAWQL_AUTH_AUDIT_PATH`                        | SQLite path (default `$CLAWQL_HOME/auth-audit.db`)                                       |
| `CLAWQL_ID_JAG_ISSUER_ENABLED`                  | Enable ClawQL self-hosted ID-JAG issuer (EMA IdP)                                        |
| `CLAWQL_ID_JAG_ISSUER_ORG_ID`                   | Org id for single-tenant issuer material (or `CLAWQL_DEFAULT_ORG_ID`)                    |
| `CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM`          | Inline dedicated RS256 PKCS#8 for ID-JAG                                                 |
| `CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH`     | **Preferred** dedicated RS256 PKCS#8 for ID-JAG (avoid sharing MCP OAuth AS key in prod) |
| `CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET`           | HS256 issuer secret (tests/dev)                                                          |
| `CLAWQL_ID_JAG_ISSUER_KEY_ID`                   | Optional `kid` for issuer JWKS                                                           |
| `CLAWQL_ID_JAG_ISSUER_URI`                      | Assertion `iss` (default `$ORIGIN/oauth/id-jag/{orgId}`)                                 |
| `CLAWQL_ID_JAG_ISSUER_JWKS_URI`                 | Override published issuer JWKS URI                                                       |
| `CLAWQL_ID_JAG_ISSUER_ORIGIN`                   | Override public origin for issuer URIs                                                   |
| `CLAWQL_ID_JAG_TEE_SIGNER`                      | `1` = wrap issuer signing as Layer C TEE-shaped signer (`kind: "tee"`)                   |
| `CLAWQL_TEE_DEBUG`                              | `1` = log attestation ids when using `clawql-tee` bridge                                 |

Setting `CLAWQL_AUTH_AUDIT_STORE=off` while MCP OAuth is enabled logs a **SECURITY WARNING** at `server-http` boot — auth is live but issuance is not persisted.

Signing with only `CLAWQL_MCP_OAUTH_SIGNING_SECRET` (HS256, no RS256 PEM) logs a **SECURITY WARNING** at boot — JWKS cannot be published and every verifier must share the secret. Prefer `CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM(_PATH)` in production.

Missing `CLAWQL_API_KEY` while MCP OAuth / ID-JAG issuer is enabled logs a **SECURITY WARNING** — EMA admin and `/oauth/id-jag/issue` return 503 until set.

Invalid `CLAWQL_EMA_ORGS_*` / `CLAWQL_MCP_OAUTH_CLIENTS_*` bootstrap values log a **SECURITY WARNING** (silent empty registry is no longer quiet).

Registered MCP clients may include `redirectUris` for the interactive `authorization_code` path. Bootstrap via `CLAWQL_MCP_OAUTH_CLIENTS_JSON` / `_PATH`. Refresh tokens persist an ATR claims snapshot so `authorization_code` subjects survive refresh.

## Per-org IdP routing (multi-tenant)

For SaaS with one IdP per company, inject an `OrgIdpRouter` (e.g. from `createOrgCreditsIdpRouter` in `clawql-payments`) and call `verifyOidcBearerTokenWithOrgRoutingEffect`. The router selects JWKS/issuer/domains from the JWT email domain (or `iss`). ClawQL still does **not** issue login tokens.

## Step-up (not SSO)

The public API is **Effect-first**: functions return `Effect`, and services/Layers are used for DI.
Hosts run the effects with `Effect.runSync` / `Effect.runPromise` at their own boundary.

```ts
import { Effect } from "effect";
import { createClawQLAuth, createStepUpStoreLayer, StepUpStoreService } from "clawql-auth";

const auth = createClawQLAuth({ mode: "oidc", stepUpStorePath: "/path/step-up.json" });

const claims = await Effect.runPromise(
  auth.resolveClaimsEffect({ authorization: `Bearer ${jwt}` })
);
await Effect.runPromise(auth.assertToolAccessEffect(claims, "payments_credits_transfer_confirm"));
```

WebAuthn is a **pluggable** `WebAuthnStepUpVerifier` (fails closed until injected). Prefer IdP passkeys for human login.

**Face ID / Touch ID / Windows Hello** and **YubiKey / Titan** are the same WebAuthn surface — platform vs roaming authenticators. ClawQL never sees biometric bytes; keys stay in Secure Enclave / TPM / the hardware token.

## Phase 4–7 surfaces (library)

| Area            | Entry points                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Domain TXT      | `createDomainChallengeEffect` / `verifyDomainTxtEffect`                                                                       |
| Offboarding     | `offboardSubjectEffect` (revoke `cqk_` keys + mark OAuth re-auth)                                                             |
| SIWE login      | `issueSiweNonceEffect` / `verifySiweLoginEffect` → ATR                                                                        |
| Primary TOTP    | `primaryTotpLoginEffect` (uses `StepUpStoreService` enrollments)                                                              |
| Primary passkey | `issuePasskeyLoginChallengeEffect` + `primaryPasskeyLoginEffect` + `PasskeyCredentialStore.enroll`/`delete` (inject `WebAuthnStepUpVerifier`) |
| Vault leases    | `VaultDynamicSecretProvider` / `VaultDynamicSecretService`                                                                    |
| Re-auth UX      | `buildReauthUrl` + `notifyReauthRequiredEffect`; Hermes: `createTelegramReauthNotifierFromEnv` (`clawql-agents`)               |
| ID-JAG TEE      | `CLAWQL_ID_JAG_TEE_SIGNER=1` or inject `assertionSigner` / `clawql-tee` `createDevTeeIdJagSigner`                              |

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
