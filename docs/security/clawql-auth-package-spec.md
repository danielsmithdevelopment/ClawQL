# clawql-auth — Package Specification

**Status:** Design / roadmap · August 2026 · v0.1  
**Package:** [`packages/clawql-auth/`](../../packages/clawql-auth/)  
**Shipped today:** gateway `noAuth` / `apiKey` / `oidc` (JWT **consumer**), ATR claims, provider upstream headers, AWS SigV4 helpers, shared TOTP/WebAuthn step-up, **SecretStore** plugins (SQLite default, OpenBao/Vault/Infisical/…) — see [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md) and [`packages/clawql-auth/README.md`](../../packages/clawql-auth/README.md).

> **Scope of this spec:** grow `clawql-auth` into the single home for **inbound MCP OAuth 2.1** (gateway-facing) and **outbound** OAuth to upstreams — especially the **mutex-protected proactive refresh** pattern that avoids the MCP ecosystem’s constant re-auth failure mode ([Daniel Lockyer / X](https://x.com/daniellockyer/status/2090501527215468682)). This does **not** make ClawQL a full human IdP (login UI / user directory). Prefer API keys / PATs / Vault dynamic secrets when the use case allows; add user-delegated OAuth only where required.

**Non-goals for v0.1 implementation:** replacing existing OIDC _consumer_ mode; inventing per-adapter refresh logic outside this package.

---

## 1. Purpose

`clawql-auth` today handles **inbound** gateway authentication: verify who is calling ClawQL and produce scoped **ATR claims** before any MCP tool runs. It also attaches **static** upstream credentials (env JSON, AWS SigV4) on `execute`.

This specification extends the package along two axes that must stay distinct:

| Direction    | Question answered                    | Examples                                                                                                              |
| ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Inbound**  | Who may call **our** MCP gateway?    | MCP OAuth 2.1 token endpoint, API keys, OIDC JWT consumer (shipped), future SAML/LDAP _client_ modes                  |
| **Outbound** | How does ClawQL call **their** APIs? | OAuth refresh to Google/Microsoft/Slack, Vault dynamic secrets, PAT rotation, client-credentials for service accounts |

**Inbound** auth is synchronous on the request path — fail closed before tool dispatch. **Outbound** auth is asynchronous background refresh with mutex coalescing — never block every `execute` on a token refresh race.

ClawQL remains an **OAuth consumer** for human SSO (see shipped `oidc` mode) and an **OAuth authorization server** only for MCP client registration flows — not a replacement for Okta, Entra, or Auth0 login UX.

---

## 2. Core Design Principles

1. **Vault-first secrets (pluggable)** — long-lived refresh tokens, client secrets, and API keys live behind a **`SecretStore`** interface. Default local/homelab/Hermes backend is **SQLite**. Enterprise TEE uses **OpenBao** (preferred OSS, Apache 2.0 Vault fork) or HashiCorp Vault. Optional adapters: Infisical, Vaultwarden, 1Password Secrets Automation, env (CI only). Process env holds references or Connect tokens — not raw refresh tokens in production.

2. **Proactive refresh (60 s window)** — refresh access tokens when `expires_at - now < 60_000` ms, not when the upstream returns `401`. Reactive refresh under concurrent load is the root cause of MCP OAuth flakiness.

3. **Mutex-protected refresh** — one in-flight refresh per `(tenantId, provider, subject)` key; concurrent callers await the same promise. Never stampede the IdP refresh endpoint.

4. **WORM-audited** — every token issue, refresh, rotation, and re-auth requirement appends to the auth WORM via `clawql-audit`. Secrets never appear in audit payloads — only hashes, provider ids, and outcome codes.

5. **Fail-closed** — invalid inbound credentials reject the MCP request. Expired outbound tokens without a refresh path surface `ReauthRequiredError` to the caller; the gateway does not silently downgrade to unauthenticated upstream calls.

---

## 3. Package Structure

Target layout under `packages/clawql-auth/` (new paths in **bold**):

```
packages/clawql-auth/
├── src/
│   ├── index.ts                    # public exports (Effect-first)
│   ├── gateway.ts                  # ✅ shipped — noAuth / apiKey / oidc consumer
│   ├── oidc.ts                     # ✅ shipped — JWT verify → ATR
│   ├── policy.ts                   # ✅ shipped — MFA / financial tool gates
│   ├── provider-auth-headers.ts    # ✅ shipped — static upstream headers
│   ├── aws-sigv4.ts                # ✅ shipped
│   ├── step-up/                    # ✅ shipped — TOTP / WebAuthn + passkey selection helpers
│   ├── stores/                     # ✅ shipped — SecretStore + sqlite/vault/openbao/… plugins
│   ├── inbound/
│   │   ├── api-key/
│   │   │   └── validator.ts        # APIKeyValidator (extends shipped gateway)
│   │   ├── jwt/
│   │   │   └── atr-claims.ts       # ATRClaims mapping helpers
│   │   ├── oidc/
│   │   │   └── consumer.ts         # ✅ thin re-export of shipped oidc mode
│   │   └── mcp-oauth/
│   │       └── server.ts             # MCPOAuthServer — MCP OAuth 2.1 AS surface
│   ├── outbound/
│   │   └── oauth/
│   │       ├── token-store.ts      # OAuthTokenStore — mutex refresh
│   │       ├── refresh.ts          # executeRefresh, isExpiringSoon
│   │       ├── client-creds.ts     # ClientCredentialsFlow
│   │       ├── auth-code.ts        # AuthorizationCodeFlow (PKCE)
│   │       ├── reauth.ts           # ReauthRequiredError, OAUTH_REAUTH_REQUIRED
│   │       └── providers/
│   │           ├── google.ts
│   │           ├── microsoft.ts
│   │           └── slack.ts
│   ├── vault/
│   │   └── dynamic-secrets.ts      # VaultDynamicSecretProvider (leases — distinct from SecretStore KV)
│   ├── outbound-api-keys.ts        # OutboundAPIKeyManager
│   └── audit/
│       └── worm-types.ts           # AuthWORMEntryType union
├── package.json
└── README.md
```

**Dependency rule:** `clawql-auth` may depend on `clawql-audit` and `jose`; it must not import `clawql-api`, vertical packages, or MCP transport. Host processes inject **`SecretStore`**, Vault clients, and WORM appenders via Effect `Layer` / factory options.

---

## 4. Inbound Authentication

### 4.1 MCP OAuth 2.1 server (`MCPOAuthServer`)

Implements the authorization-server surface required for MCP clients that obtain tokens against ClawQL (distinct from OIDC _consumer_ mode, which verifies customer IdP JWTs).

```typescript
import { createHash, randomUUID } from "node:crypto";
import { Effect } from "effect";
import type { AtrClaims } from "../gateway.js";
import type { AuthWORMAppend } from "../audit/worm-types.js";

export type GrantType =
  | "authorization_code" // human operators (interactive — open)
  | "client_credentials" // machine-to-machine (agents)
  | "refresh_token"
  | "id_jag"; // EMA — wire: urn:ietf:params:oauth:grant-type:jwt-bearer + assertion

export type MCPTokenRequest = {
  grant_type: GrantType;
  client_id?: string;
  client_secret?: string;
  code?: string;
  refresh_token?: string;
  scope?: string;
  code_verifier?: string;
  assertion?: string; // ID-JAG identity assertion JWT
  org_id?: string; // EMA org lookup for group→scope mapping
};

export type MCPTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export class MCPOAuthServer {
  constructor(
    private readonly appendWorm: AuthWORMAppend,
    private readonly signAccessToken: (claims: AtrClaims, ttlSec: number) => Promise<string>
  ) {}

  /** POST /oauth/token — issue MCP access (and optional refresh) tokens. */
  async issueToken(req: MCPTokenRequest): Promise<MCPTokenResponse> {
    const subject = await this.authenticateClient(req);
    const scopes = (req.scope ?? "mcp:tools").split(/\s+/).filter(Boolean);
    const ttlSec = 3600;
    const claims: AtrClaims = {
      sub: subject,
      role: "mcp_client",
      scope: scopes,
      tenantId: subject.split(":")[0],
    };
    const access_token = await this.signAccessToken(claims, ttlSec);
    const refresh_token = req.grant_type === "authorization_code" ? randomUUID() : undefined;

    await Effect.runPromise(
      this.appendWorm({
        type: "MCP_TOKEN_ISSUED",
        subject,
        clientId: req.client_id,
        scopes,
        accessTokenHash: createHash("sha256").update(access_token).digest("hex"),
        refreshTokenHash: refresh_token
          ? createHash("sha256").update(refresh_token).digest("hex")
          : undefined,
        grantType: req.grant_type,
      })
    );

    return {
      access_token,
      token_type: "Bearer",
      expires_in: ttlSec,
      refresh_token,
      scope: scopes.join(" "),
    };
  }

  /** Validate Bearer on inbound MCP HTTP — maps to ATR claims or throws. */
  async validateToken(authorizationHeader: string | undefined): Promise<AtrClaims> {
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new Error("missing_bearer");
    }
    const token = authorizationHeader.slice("Bearer ".length);
    return this.verifyAccessToken(token);
  }

  private async authenticateClient(req: MCPTokenRequest): Promise<string> {
    // Registered MCP clients in Vault / DB — v0.1 stub
    if (!req.client_id) throw new Error("invalid_client");
    return `${req.client_id}:service`;
  }

  private async verifyAccessToken(_token: string): Promise<AtrClaims> {
    // jose verify — same key material as issueToken
    throw new Error("not_implemented");
  }
}
```

Every successful `issueToken` emits **`MCP_TOKEN_ISSUED`** to the auth WORM (hashes only).

#### 4.1.1 Enterprise-Managed Authorization (EMA / ID-JAG)

**Shipped** in `inbound/id-jag.ts` + `inbound/mcp-oauth.ts` (`exchangeIdJag`).

Enterprise-Managed Authorization is the stable MCP extension for org-wide connector authorization via the identity provider (Okta Cross App Access at launch). Admins map IdP groups → ATR scopes once; users inherit MCP access on first login with no per-connector consent.

Grant types:

| Grant                | Wire value                                                  | Status                          |
| -------------------- | ----------------------------------------------------------- | ------------------------------- |
| `client_credentials` | `client_credentials`                                        | Shipped                         |
| `refresh_token`      | `refresh_token`                                             | Shipped                         |
| `id_jag`             | `urn:ietf:params:oauth:grant-type:jwt-bearer` + `assertion` | **Shipped**                     |
| `authorization_code` | `authorization_code`                                        | Declared; interactive path open |

Admin configuration (`EmaConfigStore`):

```typescript
type EmaGroupScopeMapping = {
  idpGroup: string; // e.g. "engineering"
  role?: string; // ATR role when matched
  scope: string[]; // MCP tool scopes (unioned across matches)
};

type EmaOrgConfig = {
  orgId: string;
  idpJwksUri: string;
  idpIssuer: string;
  audience: string; // ClawQL MCP resource origin (ID-JAG aud)
  groupMappings: EmaGroupScopeMapping[];
};
```

ID-JAG exchange verifies the IdP assertion (JWKS / HS256 dev), maps groups → ATR scope, mints RS256 (production) or HS256 (dev) access JWT + `atr` claim used by `client_credentials`, and emits **`MCP_TOKEN_ISSUED`** with `grantType: "id_jag"`, `subjectId`, `orgId`, `role`, `scope`, `idpGroups` (all assertion groups), and `matchedIdpGroups` (groups that drove the mapping). RS256 deployments publish verifying keys at `GET /.well-known/jwks.json` with `jwks_uri` in OAuth AS discovery. No refresh token is issued — token lifetime follows IdP policy (same downstream Panguard enforcement path).

**Auth WORM (shipped):** `createMcpOAuthFromEnv()` wires `createAuthEventSinkFromEnv()` by default. Entries append to a hash-chained SQLite log at `$CLAWQL_HOME/auth-audit.db` unless overridden. Set `CLAWQL_AUTH_AUDIT_STORE=off` to disable; `memory` for tests. Intentionally **no** `accessTokenHash` on events until a token→entry lookup path exists.

Discovery metadata already advertises ID-JAG in `website/src/lib/oauth-discovery-metadata.ts` (`assertion_types_supported: id-jag`).

#### 4.1.2 ClawQL as EMA IdP (ID-JAG issuer)

**Shipped (Layers A + B):** `inbound/id-jag-issuer.ts`, `inbound/ema-connector-registry.ts`, HTTP routes under `/oauth/id-jag/*` and `/.well-known/id-jag-jwks.json`.

For regulated / air-gapped customers who cannot use Okta Cross App Access, ClawQL can act as a **self-hosted ID-JAG issuer** while remaining an auth _consumer_ everywhere else — not a full human IdP.

| Layer | Scope | Status |
| ----- | ----- | ------ |
| **A — Issuer** | `issueIdJagAssertionEffect`, org RS256 keys, JWKS publish | **Shipped** |
| **B — Registry** | Admin-authorized MCP connectors per org (`EmaConnectorRegistration`) | **Shipped** |
| **C — TEE signing** | `clawql-tee` hardening for key material | Open — Layer A validated against org-controlled RS256 first |

**Flow:** Admin `PUT /oauth/ema/connectors/:orgId/:connectorId` → service `POST /oauth/id-jag/issue` with subject + groups → consumer `verifyIdJagAssertionEffect` / `POST /oauth/token` (jwt-bearer) maps groups → ATR scope. Every issuance emits **`ID_JAG_ASSERTION_ISSUED`** to the auth WORM sink.

**Never:** Okta competitor, password/SSO IdP, SAML/LDAP server, per-user connector consent UI.

**Env:** `CLAWQL_ID_JAG_ISSUER_ENABLED=1`, `CLAWQL_ID_JAG_ISSUER_ORG_ID`, signing via `CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM(_PATH)` (or shared MCP OAuth RS256 keys).

### 4.2 API key validator (`APIKeyValidator`)

Wraps shipped `apiKey` mode with optional multi-key registry and virtual-key resolver injection (inference VK pattern):

```typescript
import { timingSafeEqual } from "node:crypto";
import type { AtrClaims, ApiKeyClaimsResolver } from "../gateway.js";

export class APIKeyValidator {
  constructor(
    private readonly staticKeys: string[],
    private readonly resolver?: ApiKeyClaimsResolver
  ) {}

  validate(presented: string, headers: Record<string, string | string[] | undefined>): AtrClaims {
    for (const expected of this.staticKeys) {
      if (this.keysEqual(presented, expected)) {
        return { sub: "api-key", role: "service", scope: ["*"] };
      }
    }
    const resolved = this.resolver?.(presented, headers);
    if (resolved?.ok) return resolved.claims;
    throw new Error("invalid_api_key");
  }

  private keysEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) {
      timingSafeEqual(ba, ba);
      return false;
    }
    return timingSafeEqual(ba, bb);
  }
}
```

### 4.3 ATR claims interface

Shared between inbound modes (shipped in `gateway.ts`; reproduced here for spec completeness):

```typescript
export interface ATRClaims {
  sub: string;
  role: string;
  scope: string[];
  tenantId?: string;
  verticals?: string[];
  virtualKeyId?: string;
  acr?: string;
  amr?: string[];
  email?: string;
  emailVerified?: boolean;
  emailDomain?: string;
  orgId?: string;
}
```

### 4.4 OIDC / SSO note

Shipped **`oidc`** mode remains the path for enterprise human SSO: customer IdP issues JWT → ClawQL verifies JWKS → ATR. **Do not conflate** with `MCPOAuthServer` (MCP-native client credentials + **EMA ID-JAG exchange**) or outbound Google/Microsoft OAuth (upstream API access). SAML/LDAP _client_ modes are roadmap-only; they map external assertions into `ATRClaims` the same way OIDC does today.

**EMA vs OIDC consumer:** OIDC mode verifies bearer JWTs on every inbound MCP request (gateway consumer). EMA ID-JAG is a **token issuance** grant on the MCP authorization server — the IdP assertion is exchanged once at `/oauth/token` for a ClawQL access JWT. Both produce identical `AtrClaims` for Panguard; only the issuance path differs.

### 4.5 Passkeys / WebAuthn (Face ID, Touch ID, YubiKey)

Face ID / Touch ID / Windows Hello and external FIDO2 keys (YubiKey, Titan, …) are covered by the **same** WebAuthn passkey surface — not separate SDKs.

| Authenticators                                      | WebAuthn term            | `authenticatorAttachment` |
| --------------------------------------------------- | ------------------------ | ------------------------- |
| Face ID, Touch ID, Windows Hello, Android biometric | Platform                 | `platform`                |
| YubiKey, Titan, Feitian, other FIDO2                | Roaming / cross-platform | `cross-platform`          |

Shipped helpers in `step-up/passkey-options.ts`:

```typescript
import { buildPasskeyAuthenticatorSelection } from "clawql-auth";

/**
 * authenticatorSelection for registration:
 * - residentKey + userVerification required → OS biometric / PIN for platform authenticators
 * - omit authenticatorAttachment → browser offers both (recommended default)
 * - requirement: 'hardware-only' → cross-platform only (enterprise hardware-token policy)
 * - requirement: 'biometric-only' → platform only
 */
buildPasskeyAuthenticatorSelection();
buildPasskeyAuthenticatorSelection({ requirement: "hardware-only" });
buildPasskeyAuthenticatorSelection({ requirement: "biometric-only" });
```

ClawQL never touches biometric raw data; private keys remain in Secure Enclave / TPM / the hardware token. Prefer IdP passkeys for human SSO; inject `WebAuthnStepUpVerifier` when hosts need ClawQL-side step-up. See [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md#passkeys-face-id--touch-id--yubikey).

---

## 5. Outbound OAuth Token Management

Central **`OAuthTokenStore`** — the mutex-protected proactive refresh engine.

```typescript
import { Effect } from "effect";
import type { AuthWORMAppend } from "../audit/worm-types.js";
import { ReauthRequiredError } from "./reauth.js";

export type StoredOAuthToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs: number;
  scope?: string;
  tokenType?: string;
};

export type OAuthProviderId = "google" | "microsoft" | "slack" | string;

export type TokenKey = `${string}:${OAuthProviderId}:${string}`; // tenant:provider:subject

export class OAuthTokenStore {
  /** In-flight refresh promises — mutex per TokenKey */
  private readonly refreshLock = new Map<TokenKey, Promise<StoredOAuthToken>>();

  constructor(
    private readonly load: (key: TokenKey) => Promise<StoredOAuthToken | null>,
    private readonly save: (key: TokenKey, token: StoredOAuthToken) => Promise<void>,
    private readonly refreshFn: (
      key: TokenKey,
      current: StoredOAuthToken
    ) => Promise<StoredOAuthToken>,
    private readonly appendWorm: AuthWORMAppend
  ) {}

  /** Returns a valid access token; proactively refreshes when expiring within 60 s. */
  async getValidToken(key: TokenKey): Promise<string> {
    let token = await this.load(key);
    if (!token) {
      throw new ReauthRequiredError({ key, reason: "no_token" });
    }
    if (this.isExpiringSoon(token.expiresAtMs)) {
      token = await this.executeRefresh(key, token);
    }
    return token.accessToken;
  }

  /** Mutex-protected refresh — concurrent callers share one in-flight promise. */
  async executeRefresh(key: TokenKey, current: StoredOAuthToken): Promise<StoredOAuthToken> {
    const existing = this.refreshLock.get(key);
    if (existing) return existing;

    const refreshPromise = (async () => {
      try {
        const next = await this.refreshFn(key, current);
        await this.save(key, next);
        await Effect.runPromise(
          this.appendWorm({
            type: "OAUTH_TOKEN_REFRESHED",
            key,
            expiresAtMs: next.expiresAtMs,
            scope: next.scope,
          })
        );
        return next;
      } catch (err: unknown) {
        const oauthErr = err as { error?: string; error_description?: string };
        await Effect.runPromise(
          this.appendWorm({
            type: "OAUTH_REFRESH_FAILED",
            key,
            error: oauthErr.error ?? "unknown",
            description: oauthErr.error_description,
          })
        );
        if (oauthErr.error === "invalid_grant") {
          throw new ReauthRequiredError({ key, reason: "invalid_grant" });
        }
        throw err;
      } finally {
        this.refreshLock.delete(key);
      }
    })();

    this.refreshLock.set(key, refreshPromise);
    return refreshPromise;
  }

  /** Proactive refresh window — 60 seconds before expiry. */
  isExpiringSoon(expiresAtMs: number, nowMs = Date.now()): boolean {
    return expiresAtMs - nowMs < 60_000;
  }
}
```

**WORM events:**

| Event                   | When                                          |
| ----------------------- | --------------------------------------------- |
| `OAUTH_TOKEN_REFRESHED` | Successful proactive or reactive refresh      |
| `OAUTH_REFRESH_FAILED`  | IdP returned error (includes `invalid_grant`) |
| `OAUTH_REAUTH_REQUIRED` | Surfaced to operator/agent — see §10          |

On **`invalid_grant`**, the store throws **`ReauthRequiredError`** — refresh token revoked, password changed, or consent withdrawn. No silent retry loops.

---

## 6. OAuth Flow Implementations

### 6.1 Client credentials (`ClientCredentialsFlow`)

For service accounts and daemon agents (no user delegation):

```typescript
export type ClientCredentialsConfig = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
};

export class ClientCredentialsFlow {
  constructor(private readonly config: ClientCredentialsConfig) {}

  async fetchToken(): Promise<StoredOAuthToken> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...(this.config.scope ? { scope: this.config.scope } : {}),
    });
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw err;
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
      token_type?: string;
      scope?: string;
    };
    return {
      accessToken: json.access_token,
      expiresAtMs: Date.now() + json.expires_in * 1000,
      tokenType: json.token_type ?? "Bearer",
      scope: json.scope,
    };
  }
}
```

### 6.2 Authorization code + PKCE (`AuthorizationCodeFlow`)

For user-delegated outbound access (Hermes personal stack, SeeTheGreens operator consent):

```typescript
import { createHash, randomBytes } from "node:crypto";

export type AuthorizationCodeConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
};

export class AuthorizationCodeFlow {
  private readonly codeVerifier: string;
  readonly codeChallenge: string;

  constructor(private readonly config: AuthorizationCodeConfig) {
    this.codeVerifier = randomBytes(32).toString("base64url");
    this.codeChallenge = createHash("sha256").update(this.codeVerifier).digest("base64url");
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state,
      code_challenge: this.codeChallenge,
      code_challenge_method: "S256",
    });
    return `${this.config.authorizationUrl}?${params}`;
  }

  async exchangeCode(code: string): Promise<StoredOAuthToken> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: this.codeVerifier,
      ...(this.config.clientSecret ? { client_secret: this.config.clientSecret } : {}),
    });
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw await res.json().catch(() => new Error("token_exchange_failed"));
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAtMs: Date.now() + json.expires_in * 1000,
      scope: json.scope,
    };
  }

  async refresh(refreshToken: string): Promise<StoredOAuthToken> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      ...(this.config.clientSecret ? { client_secret: this.config.clientSecret } : {}),
    });
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw await res.json().catch(() => new Error("refresh_failed"));
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAtMs: Date.now() + json.expires_in * 1000,
    };
  }
}
```

Both flows persist tokens through **`OAuthTokenStore.save`** (Vault-backed) — never raw env vars in production.

---

## 7. Provider Configurations

### 7.1 Google

```typescript
export const googleOAuthConfig = (
  overrides?: Partial<AuthorizationCodeConfig>
): AuthorizationCodeConfig => ({
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  clientId: process.env.CLAWQL_OAUTH_GOOGLE_CLIENT_ID!,
  clientSecret: process.env.CLAWQL_OAUTH_GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.CLAWQL_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:8787/oauth/callback",
  scope: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ].join(" "),
  ...overrides,
});
```

### 7.2 Microsoft (Entra ID)

```typescript
const tenant = process.env.CLAWQL_OAUTH_MICROSOFT_TENANT ?? "common";

export const microsoftOAuthConfig = (
  overrides?: Partial<AuthorizationCodeConfig>
): AuthorizationCodeConfig => ({
  authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  clientId: process.env.CLAWQL_OAUTH_MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.CLAWQL_OAUTH_MICROSOFT_CLIENT_SECRET,
  redirectUri: process.env.CLAWQL_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:8787/oauth/callback",
  scope: ["openid", "profile", "offline_access", "User.Read", "Mail.Read"].join(" "),
  ...overrides,
});
```

### 7.3 Slack

```typescript
export const slackOAuthConfig = (
  overrides?: Partial<AuthorizationCodeConfig>
): AuthorizationCodeConfig => ({
  authorizationUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  clientId: process.env.CLAWQL_OAUTH_SLACK_CLIENT_ID!,
  clientSecret: process.env.CLAWQL_OAUTH_SLACK_CLIENT_SECRET,
  redirectUri: process.env.CLAWQL_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:8787/oauth/callback",
  scope: ["channels:read", "chat:write", "users:read"].join(","),
  ...overrides,
});
```

Provider modules export config factories only — **`OAuthTokenStore`** owns refresh timing and mutex behavior.

---

## 8. Outbound API Key Management

Static PATs and API keys for providers that do not use OAuth refresh:

```typescript
export type ProviderAuthMethod = "oauth" | "api_key" | "vault_dynamic" | "aws_sigv4" | "none";

/** Per-provider default auth method — override via CLAWQL_PROVIDER_AUTH_METHOD JSON */
export const PROVIDER_AUTH_METHOD: Record<string, ProviderAuthMethod> = {
  github: "api_key",
  cloudflare: "api_key",
  slack: "oauth",
  google: "oauth",
  microsoft: "oauth",
  aws: "aws_sigv4",
  "compute-v1": "oauth",
  "container-v1": "oauth",
  paperless: "api_key",
  onyx: "api_key",
  ramp: "oauth",
};

export class OutboundAPIKeyManager {
  constructor(private readonly vaultPathPrefix = "secret/data/clawql/providers") {}

  async getApiKey(provider: string, tenantId: string): Promise<string> {
    const method = PROVIDER_AUTH_METHOD[provider] ?? "api_key";
    if (method !== "api_key") {
      throw new Error(`provider ${provider} uses ${method}, not api_key`);
    }
    // Vault KV: clawql/providers/{tenant}/{provider}#api_key
    const path = `${this.vaultPathPrefix}/${tenantId}/${provider}`;
    return this.readVaultField(path, "api_key");
  }

  resolveMethod(provider: string): ProviderAuthMethod {
    const envOverride = process.env.CLAWQL_PROVIDER_AUTH_METHOD?.trim();
    if (envOverride) {
      const map = JSON.parse(envOverride) as Record<string, ProviderAuthMethod>;
      if (map[provider]) return map[provider];
    }
    return PROVIDER_AUTH_METHOD[provider] ?? "api_key";
  }

  private async readVaultField(_path: string, _field: string): Promise<string> {
    throw new Error("vault_not_configured");
  }
}
```

Integrates with shipped **`CLAWQL_PROVIDER_AUTH_JSON`** for dev; production keys route through Vault references parsed by `OutboundAPIKeyManager`.

---

## 9. SecretStore plugins

`clawql-auth` defines a single **`SecretStore`** interface. Every backend is a thin plugin — OAuth, issued API keys, nonces, and opaque secrets never import a specific vault SDK.

```typescript
// packages/clawql-auth/src/stores/types.ts
export interface SecretStore {
  getSecret(path: string): Promise<string | null>;
  setSecret(path: string, value: string): Promise<void>;
  deleteSecret(path: string): Promise<void>;
  listSecrets(prefix: string): Promise<string[]>;

  getOAuthToken(providerId: string): Promise<TokenSet | null>;
  setOAuthToken(providerId: string, token: TokenSet): Promise<void>;
  markRequiresReauth(providerId: string): Promise<void>;

  getAPIKeyRecord(keyId: string): Promise<APIKeyRecord | null>;
  saveAPIKeyRecord(record: APIKeyRecord): Promise<void>;
  setRevokedAt(keyId: string, revokedAt: Date): Promise<void>;

  storeNonce(nonce: string, data: NonceRecord): Promise<void>;
  getNonce(nonce: string): Promise<NonceRecord | null>;
  markNonceConsumed(nonce: string): Promise<void>;
  storeDomainChallenge(domain: string, challenge: DomainChallenge): Promise<void>;
  getDomainChallenge(domain: string): Promise<DomainChallenge | null>;
  deleteDomainChallenge(domain: string): Promise<void>;
}
```

### Layout

```
packages/clawql-auth/src/stores/
  types.ts              — SecretStore + TokenSet / NonceRecord / …
  base.ts               — PathSecretStore (JSON under oauth/ api-keys/ nonces/ …)
  sqlite.ts             — Default (local dev, homelab, Hermes)
  hashicorp-vault.ts    — HashiCorp Vault KV v2
  openbao.ts            — OpenBao (Vault fork, Apache 2.0 / BSL-free)
  infisical.ts          — Infisical
  vaultwarden.ts        — Vaultwarden (Bitwarden-compatible)
  onepassword.ts        — 1Password Connect / Secrets Automation
  env.ts                — Environment variables (minimal, CI only)
  memory.ts             — In-process (tests)
  resolve.ts            — CLAWQL_SECRET_STORE factory
```

### Backend choice

| Backend             | When to use                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **SQLite**          | Local dev, homelab, Hermes personal agent (default)                                                         |
| **OpenBao**         | Self-hosted OSS / commercial without HashiCorp BSL friction — **preferred** Vault-compatible recommendation |
| **HashiCorp Vault** | Enterprise TEE already standardized on Vault                                                                |
| **Infisical**       | Customer already on Infisical                                                                               |
| **1Password**       | Customer on 1Password Teams/Business — no credential migration                                              |
| **Vaultwarden**     | Bitwarden-compatible self-host                                                                              |
| **env**             | CI smoke only — not for refresh tokens in production                                                        |

OpenBao’s adapter is API-identical to Vault (same KV v2 HTTP) — different endpoint / license.

### Registration

```typescript
import {
  createClawQLAuth,
  createSQLiteSecretStore,
  createOpenBaoStore,
  createHashiCorpVaultStore,
  createInfisicalStore,
  createOnePasswordStore,
  resolveSecretStore,
} from "clawql-auth";

// Default: SQLite under $CLAWQL_HOME/secrets.db (or ~/.clawql/secrets.db)
const auth = createClawQLAuth({
  secretStore: createSQLiteSecretStore({ path: "~/.clawql/secrets.db" }),
});

// Enterprise TEE — prefer OpenBao for OSS self-host
createClawQLAuth({
  secretStore: createOpenBaoStore({
    endpoint: process.env.BAO_ADDR!,
    token: process.env.BAO_TOKEN!,
    mountPath: "secret",
    pathPrefix: "clawql",
  }),
});

// Or HashiCorp Vault / Infisical / 1Password / env via resolveSecretStore()
createClawQLAuth({
  secretStore: resolveSecretStore({ kind: "infisical" }),
});
```

`CLAWQL_SECRET_STORE=sqlite|openbao|hashicorp-vault|infisical|vaultwarden|onepassword|env|memory` selects the backend when using `resolveSecretStore()` / `createClawQLAuth()` without an explicit instance.

Path layout (all backends via `PathSecretStore`): `oauth/{providerId}`, `api-keys/{keyId}`, `nonces/{nonce}`, `domain-challenges/{domain}`.

---

## 10. Vault / OpenBao dynamic secrets (leases)

Short-lived credentials from Vault/OpenBao engines (DB, AWS, PKI) — **distinct** from `SecretStore` KV (OAuth refresh tokens and issued API key hashes):

```typescript
export type VaultDynamicLease = {
  leaseId: string;
  leaseDurationSec: number;
  data: Record<string, string>;
  renewable: boolean;
};

export class VaultDynamicSecretProvider {
  constructor(
    private readonly vaultAddr: string,
    private readonly vaultToken: string
  ) {}

  /** Issue credentials from a Vault role — e.g. database/creds/readonly */
  async getDynamicSecret(rolePath: string): Promise<VaultDynamicLease> {
    const res = await fetch(`${this.vaultAddr}/v1/${rolePath}`, {
      method: "GET",
      headers: { "X-Vault-Token": this.vaultToken },
    });
    if (!res.ok) throw new Error(`vault_dynamic_secret_failed: ${res.status}`);
    const json = (await res.json()) as {
      lease_id: string;
      lease_duration: number;
      renewable: boolean;
      data: Record<string, string>;
    };
    return {
      leaseId: json.lease_id,
      leaseDurationSec: json.lease_duration,
      renewable: json.renewable,
      data: json.data,
    };
  }

  /** Renew before 60 s TTL boundary — same proactive window as OAuthTokenStore */
  async renewIfNeeded(lease: VaultDynamicLease): Promise<VaultDynamicLease> {
    if (lease.leaseDurationSec > 60) return lease;
    const res = await fetch(`${this.vaultAddr}/v1/sys/leases/renew`, {
      method: "POST",
      headers: {
        "X-Vault-Token": this.vaultToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lease_id: lease.leaseId }),
    });
    if (!res.ok) throw new Error("vault_lease_renew_failed");
    const json = (await res.json()) as { lease_duration: number };
    return { ...lease, leaseDurationSec: json.lease_duration };
  }
}
```

OAuth refresh tokens use **`SecretStore` / `OAuthTokenStore`**; dynamic leases use this provider. Never mix the two in one code path.

---

## 11. WORM Audit Types & Re-authorization Flow

### 11.1 `AuthWORMEntryType` union

Complete auth WORM event taxonomy (append-only via `clawql-audit`):

```typescript
export type AuthWORMEntryType =
  | {
      type: "MCP_TOKEN_ISSUED";
      subject: string;
      clientId: string;
      scopes: string[];
      accessTokenHash: string;
      refreshTokenHash?: string;
      grantType: string;
    }
  | {
      type: "MCP_TOKEN_REVOKED";
      subject: string;
      clientId: string;
      reason: string;
    }
  | {
      type: "OAUTH_TOKEN_STORED";
      key: string;
      provider: string;
      expiresAtMs: number;
      scope?: string;
    }
  | {
      type: "OAUTH_TOKEN_REFRESHED";
      key: string;
      expiresAtMs: number;
      scope?: string;
    }
  | {
      type: "OAUTH_REFRESH_FAILED";
      key: string;
      error: string;
      description?: string;
    }
  | {
      type: "OAUTH_REAUTH_REQUIRED";
      key: string;
      reason: string;
      notifyChannel?: "telegram" | "slack" | "email";
    }
  | {
      type: "API_KEY_ROTATED";
      provider: string;
      tenantId: string;
      keyId: string;
    }
  | {
      type: "VAULT_LEASE_ISSUED";
      rolePath: string;
      leaseId: string;
      ttlSec: number;
    }
  | {
      type: "VAULT_LEASE_RENEWED";
      leaseId: string;
      ttlSec: number;
    }
  | {
      type: "STEP_UP_VERIFIED";
      subjectId: string;
      method: "totp" | "webauthn";
      tool?: string;
    };

export type AuthWORMAppend = (entry: AuthWORMEntryType) => Effect.Effect<void, never, never>;
```

### 11.2 `ReauthRequiredError`

```typescript
export class ReauthRequiredError extends Error {
  readonly code = "OAUTH_REAUTH_REQUIRED" as const;

  constructor(readonly detail: { key: string; reason: string; authorizationUrl?: string }) {
    super(`Re-authorization required: ${detail.reason} (${detail.key})`);
    this.name = "ReauthRequiredError";
  }
}
```

### 11.3 Re-authorization flow (11 steps)

When **`invalid_grant`** or missing refresh token surfaces **`ReauthRequiredError`**:

1. **`OAuthTokenStore`** catches refresh failure; classifies `invalid_grant`.
2. Append **`OAUTH_REAUTH_REQUIRED`** to auth WORM (no secrets).
3. Mark token record `status: "needs_reauth"` in Vault KV.
4. **`clawql-api` / agent runtime** receives structured error — not a generic 500.
5. **`clawql-agents`** (Hermes orchestrator) maps error to human-readable intent.
6. Build PKCE **`AuthorizationCodeFlow.buildAuthorizationUrl(state)`** for the provider.
7. **Hermes sends Telegram message** with authorization link (personal stack — see [`personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md)).
8. Operator completes browser consent; callback hits `CLAWQL_OAUTH_REDIRECT_URI`.
9. Exchange code → new **`StoredOAuthToken`**; persist via Vault.
10. Append **`OAUTH_TOKEN_STORED`**; clear `needs_reauth`.
11. Resume pending tool / agent task — **`getValidToken`** succeeds on retry.

**Hermes Telegram note:** the personal Mac Mini stack uses Telegram as the sole human notification channel. Re-auth links must never include refresh tokens or client secrets — only the PKCE authorization URL and a short state id. See §8 of the Hermes setup doc for BotFather configuration.

---

## Provider Decision Matrix

| Provider / use case             | Preferred auth   | OAuth flow                    | Notes                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub API                      | API key (PAT)    | —                             | Fine-grained PAT in Vault; rotate on leak                                                                                                                                                                                                                                                                                    |
| Cloudflare                      | API token        | —                             | Scoped token per zone                                                                                                                                                                                                                                                                                                        |
| Google Workspace (Gmail, Drive) | OAuth            | Authorization code + PKCE     | **`OAuthTokenStore`** + Google config                                                                                                                                                                                                                                                                                        |
| Microsoft 365 / Graph           | OAuth            | Authorization code + PKCE     | Tenant-specific Entra app                                                                                                                                                                                                                                                                                                    |
| Slack (bot + user)              | OAuth            | Authorization code            | v2 OAuth for `chat:write`                                                                                                                                                                                                                                                                                                    |
| AWS APIs                        | SigV4            | —                             | Shipped **`aws-sigv4.ts`**; IRSA in cluster                                                                                                                                                                                                                                                                                  |
| Ramp / payments                 | OAuth            | Client credentials + scopes   | Existing `clawql-payments` pattern                                                                                                                                                                                                                                                                                           |
| HashiCorp Vault                 | Token / K8s auth | —                             | **`VaultDynamicSecretProvider`** for leases                                                                                                                                                                                                                                                                                  |
| Self-hosted (Paperless, Onyx)   | API key          | —                             | Static token in Vault KV                                                                                                                                                                                                                                                                                                     |
| **SeeTheGreens LOS**            | Mixed            | Service OAuth + operator PKCE | Regulated lending vertical: service accounts for pipeline automation; **operator re-auth via PKCE** when user-delegated Google/Microsoft tokens expire — never store borrower PII in OAuth state. Prefer API keys for internal microservices; OAuth only for external SaaS (e.g. credit bureau APIs requiring user consent). |

**Rule:** default to **`api_key`** or **`vault_dynamic`** unless the upstream _requires_ user-delegated OAuth scopes.

---

## Integration with clawql-agents

Future **`clawql-agents`** package resolves outbound credentials before MCP `execute` calls — single entry point for Hermes/Cline:

```typescript
import { Effect } from "effect";
import { OAuthTokenStore } from "clawql-auth/outbound/oauth/token-store";
import { OutboundAPIKeyManager, PROVIDER_AUTH_METHOD } from "clawql-auth/outbound-api-keys";
import { ReauthRequiredError } from "clawql-auth/outbound/oauth/reauth";

export type OutboundCredential =
  | { kind: "bearer"; token: string }
  | { kind: "headers"; headers: Record<string, string> }
  | { kind: "reauth_required"; error: ReauthRequiredError };

/** Called by agent runtime before provider execute — never per-adapter refresh logic. */
export async function getOutboundCredential(input: {
  tenantId: string;
  subject: string;
  provider: string;
  tokenStore: OAuthTokenStore;
  apiKeys: OutboundAPIKeyManager;
}): Promise<OutboundCredential> {
  const method = input.apiKeys.resolveMethod(input.provider);

  if (method === "oauth") {
    const key = `${input.tenantId}:${input.provider}:${input.subject}` as const;
    try {
      const token = await input.tokenStore.getValidToken(key);
      return { kind: "bearer", token };
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        return { kind: "reauth_required", error: err };
      }
      throw err;
    }
  }

  if (method === "api_key") {
    const apiKey = await input.apiKeys.getApiKey(input.provider, input.tenantId);
    return { kind: "headers", headers: { Authorization: `Bearer ${apiKey}` } };
  }

  if (method === "aws_sigv4") {
    return { kind: "headers", headers: {} }; // SigV4 signing in clawql-auth/aws-sigv4
  }

  return { kind: "headers", headers: {} };
}
```

Agents **must not** implement provider-specific refresh — delegate to **`OAuthTokenStore`**.

---

## Implementation Sequence

> **Alignment note (August 2026 GA):** The canonical spec (§13) orders phases as inbound-first. The repo shipped **outbound OAuth (Phases 2–3)** ahead of inbound HTTP wiring because Hermes/Cline needed mutex refresh first. **EMA / ID-JAG is Phase 1 inbound** — HTTP token route, persistent org config, and Okta JWKS preset are **shipped** on `server-http`.

### Canonical §13 → repo status

| Canonical phase               | Scope (from full spec)                                   | Repo status                                                                                        | Next priority                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 — Inbound core**          | API key validate/issue, MCP OAuth 2.1 AS, **EMA ID-JAG** | **Partial** — library + **`server-http` HTTP wiring shipped**; `authorization_code` open           | **P0 done:** token endpoint; **P0 done:** persistent `EmaConfigStore`; **P1 done:** Okta JWKS preset; **P1 done:** auth WORM audit; **P1 done:** RS256 AS signing + JWKS; **P2 open:** interactive auth-code |
| **2 — Outbound OAuth core**   | Mutex token store, proactive refresh, client credentials | **Shipped** (`oauth/token-store.ts`, `oauth/client-creds.ts`)                                      | Maintain; no new work unless regressions                                                                                                                                                                     |
| **3 — Auth Code + providers** | PKCE, Google/Microsoft/Slack                             | **Shipped** (`oauth/auth-code.ts`, `oauth/providers.ts`)                                           | Hermes user-delegated flows consume this                                                                                                                                                                     |
| **4 — Team / org**            | Team model, domain TXT, offboarding                      | **Partial** — issued keys have org/team; domain TXT / wallet / passkey inbound modules not started | After Phase 1 completion                                                                                                                                                                                     |
| **5 — Alt inbound**           | SIWE, TOTP, passkey as primary login                     | **Partial** — step-up TOTP/WebAuthn shipped; not primary inbound login surfaces                    | Phase 5 per canonical spec                                                                                                                                                                                   |
| **6 — Vault dynamic secrets** | DB cred leases                                           | **Partial** — `SecretStore` plugins shipped; dynamic lease provider open                           | Enterprise TEE tier                                                                                                                                                                                          |
| **7 — Re-auth UX**            | Hermes Telegram, reauth URLs                             | **Partial** — `ReauthRequiredError` + WORM events shipped; Telegram UX open                        | Production Hermes                                                                                                                                                                                            |

### Phase 1 inbound — remaining work (ordered)

1. ~~**HTTP `/oauth/token` route**~~ — **Shipped** in `server-http` via `attachMcpOAuthRoutes`.
2. ~~**Persistent `EmaConfigStore`**~~ — **Shipped** (`ema-config-store.ts` + SecretStore `ema-orgs/` prefix + admin API).
3. ~~**Okta production JWKS path**~~ — **Shipped** (`okta-id-jag.ts` preset + group claim fallbacks).
4. **`authorization_code` grant** — interactive MCP login for non-EMA deployments.
5. ~~**RS256 issued access tokens + JWKS**~~ — **Shipped** (`mcp-oauth-signing.ts`, `GET /.well-known/jwks.json`).

### Three inbound paths (do not conflate)

| Path                                        | When                                                               | Token source                      | Shipped                                          |
| ------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------ |
| **OIDC consumer** (`CLAWQL_AUTH_MODE=oidc`) | Enterprise puts IdP JWT on every MCP request                       | Customer IdP                      | Yes — `oidc.ts`                                  |
| **MCP OAuth AS** (`MCPOAuthServer`)         | MCP clients obtain ClawQL-issued bearer                            | ClawQL signs JWT with `atr`       | Yes — library + **`server-http` `/oauth/token`** |
| **EMA ID-JAG** (grant on MCP AS)            | Org admin pre-authorizes connector at IdP; zero-touch user inherit | IdP assertion → ClawQL access JWT | Yes — `id-jag.ts` + token endpoint               |

All three produce **`AtrClaims`** for the same Panguard enforcement path. EMA does not replace OIDC consumer mode — it replaces per-user OAuth consent on the **issuance** side for MCP connectors.

| Phase                            | Scope                                                                                   | Exit criteria                                                   | Status                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **1 — Foundation**               | Auth event sink + issued API key registry (`cqk_`)                                      | Unit tests for issue/validate/revoke; gateway resolver          | **Shipped** (`api-keys/`, `audit/auth-events.ts`)                                      |
| **2 — Outbound core**            | `OAuthTokenStore` mutex + 60s proactive refresh; `ClientCredentialsFlow`                | Concurrent refresh N=50 → one IdP call; client-creds unit tests | **Shipped** (`oauth/token-store.ts`, `oauth/client-creds.ts`)                          |
| **3 — Auth Code + providers**    | PKCE `AuthorizationCodeFlow`; Google/Microsoft/Slack catalogs; outbound API key manager | PKCE start/callback tests; provider matrix                      | **Shipped** (`oauth/auth-code.ts`, `oauth/providers.ts`, `oauth/outbound-api-key.ts`)  |
| **4 — Inbound MCP OAuth**        | `MCPOAuthServer` + **EMA ID-JAG** + HTTP `/oauth/token` + EMA admin API                 | Issue/validate/refresh/id-jag + HTTP integration tests          | **Shipped** (`inbound/*`, `server-http` wiring) — `mcp-api-adapter` optional follow-up |
| **5 — SecretStore + re-auth UX** | `SecretStore` plugins (SQLite/OpenBao/Vault/…); dynamic leases; Hermes Telegram re-auth | Interface + SQLite/Vault/OpenBao shipped; Hermes UX open        | **Partial** (`stores/` shipped; dynamic leases + Telegram UX still open)               |

### Shipped slice (August 2026)

- **`IssuedApiKeyStore`**: issue `cqk_<id>_<secret>` once; salted SHA-256 only; org/team filters; `createClawQLAuth({ apiKeyStorePath })`.
- **`OAuthTokenStore`**: proactive refresh + single-flight mutex; `invalid_grant` → `ReauthRequiredError`.
- **`ClientCredentialsFlow` / `AuthorizationCodeFlow` (PKCE)** + provider catalogs.
- **`MCPOAuthServer`**: HS256 access JWTs with ATR claims; refresh-token rotation; **EMA ID-JAG** group→scope exchange (`id_jag` grant).
- Hosts inject **`AuthEventSink`** for WORM (no hard `clawql-audit` dependency yet).

Phases may land independently of full Vault / Hermes Telegram UX. Shipped OIDC **consumer** mode is untouched.

---

## 12. Package Dependencies

Target `package.json` additions (v0.1 outbound OAuth milestone):

```json
{
  "dependencies": {
    "clawql-audit": "workspace:*",
    "effect": "^3.21.4",
    "jose": "^6.2.8"
  },
  "optionalDependencies": {
    "node-vault": "^0.10.2"
  },
  "peerDependencies": {
    "@aws-crypto/sha256-js": "^5.2.0",
    "@smithy/protocol-http": "^5.5.16",
    "@smithy/signature-v4": "^5.6.9"
  }
}
```

| Dependency                  | Role                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| **`clawql-audit`**          | Append-only auth WORM (`MCP_TOKEN_ISSUED`, `OAUTH_*`, `VAULT_*`)                       |
| **`jose`**                  | JWT sign/verify for `MCPOAuthServer` and shipped OIDC consumer                         |
| **`node-vault`** (optional) | Legacy optional — preferred path is fetch-based `HashiCorpVaultStore` / `OpenBaoStore` |
| **`effect`**                | Existing — all new services expose `Effect` + `Layer`                                  |

Existing AWS SigV4 dependencies remain for bundled AWS provider slugs.

## Related

- [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md) — shipped OIDC consumer + step-up
- [`mcp-proxy-jwt-atr.md`](./mcp-proxy-jwt-atr.md) — mesh / Panguard JWT ATR
- [`../homelab/personal-agent-hermes-cline.md`](../homelab/personal-agent-hermes-cline.md) — personal Hermes/Cline stack that will consume outbound OAuth
- [`../vision/clawql-modularization-v2.md`](../vision/clawql-modularization-v2.md) — Layer 2 placement
- Package README: [`packages/clawql-auth/README.md`](../../packages/clawql-auth/README.md)

---

_clawql-auth Package Specification · v0.1 · August 2026_  
_Location: packages/clawql-auth/ · Contact: daniel@clawql.com_
