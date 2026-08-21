# clawql-auth — Package Specification

**Status:** Design / roadmap · August 2026 · v0.1  
**Package:** [`packages/clawql-auth/`](../../packages/clawql-auth/)  
**Shipped today:** gateway `noAuth` / `apiKey` / `oidc` (JWT **consumer**), ATR claims, provider upstream headers, AWS SigV4 helpers, shared TOTP/WebAuthn step-up — see [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md) and [`packages/clawql-auth/README.md`](../../packages/clawql-auth/README.md).

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

1. **Vault-first secrets** — long-lived refresh tokens, client secrets, and API keys live in HashiCorp Vault (KV v2 or dynamic secrets engine). Process env holds references (`vault:secret/data/clawql/oauth/google#refresh_token`), not raw tokens. Local dev may use `$CLAWQL_HOME/Auth/` with `0600` permissions; production must not.

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
│   │   └── dynamic-secrets.ts      # VaultDynamicSecretProvider
│   ├── outbound-api-keys.ts        # OutboundAPIKeyManager
│   └── audit/
│       └── worm-types.ts           # AuthWORMEntryType union
├── package.json
└── README.md
```

**Dependency rule:** `clawql-auth` may depend on `clawql-audit` and `jose`; it must not import `clawql-api`, vertical packages, or MCP transport. Host processes inject Vault clients and WORM appenders via Effect `Layer`.

---

## 4. Inbound Authentication

### 4.1 MCP OAuth 2.1 server (`MCPOAuthServer`)

Implements the authorization-server surface required for MCP clients that obtain tokens against ClawQL (distinct from OIDC _consumer_ mode, which verifies customer IdP JWTs).

```typescript
import { createHash, randomUUID } from "node:crypto";
import { Effect } from "effect";
import type { AtrClaims } from "../gateway.js";
import type { AuthWORMAppend } from "../audit/worm-types.js";

export type MCPTokenRequest = {
  grant_type: "client_credentials" | "authorization_code" | "refresh_token";
  client_id: string;
  client_secret?: string;
  code?: string;
  refresh_token?: string;
  scope?: string;
  code_verifier?: string;
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

Shipped **`oidc`** mode remains the path for enterprise human SSO: customer IdP issues JWT → ClawQL verifies JWKS → ATR. **Do not conflate** with `MCPOAuthServer` (MCP-native client credentials) or outbound Google/Microsoft OAuth (upstream API access). SAML/LDAP _client_ modes are roadmap-only; they map external assertions into `ATRClaims` the same way OIDC does today.

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

## 9. Vault Dynamic Secrets

Short-lived credentials from Vault engines (DB, AWS, PKI) — distinct from OAuth refresh tokens:

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

OAuth refresh tokens stored in Vault KV use **`OAuthTokenStore`**; dynamic secrets use this provider. Never mix the two in one code path.

---

## 10. WORM Audit Types & Re-authorization Flow

### 10.1 `AuthWORMEntryType` union

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

### 10.2 `ReauthRequiredError`

```typescript
export class ReauthRequiredError extends Error {
  readonly code = "OAUTH_REAUTH_REQUIRED" as const;

  constructor(readonly detail: { key: string; reason: string; authorizationUrl?: string }) {
    super(`Re-authorization required: ${detail.reason} (${detail.key})`);
    this.name = "ReauthRequiredError";
  }
}
```

### 10.3 Re-authorization flow (11 steps)

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

| Phase                         | Scope                                                                                   | Exit criteria                                                   | Status                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **1 — Foundation**            | Auth event sink + issued API key registry (`cqk_`)                                      | Unit tests for issue/validate/revoke; gateway resolver          | **Shipped** (`api-keys/`, `audit/auth-events.ts`)                                                        |
| **2 — Outbound core**         | `OAuthTokenStore` mutex + 60s proactive refresh; `ClientCredentialsFlow`                | Concurrent refresh N=50 → one IdP call; client-creds unit tests | **Shipped** (`oauth/token-store.ts`, `oauth/client-creds.ts`)                                            |
| **3 — Auth Code + providers** | PKCE `AuthorizationCodeFlow`; Google/Microsoft/Slack catalogs; outbound API key manager | PKCE start/callback tests; provider matrix                      | **Shipped** (`oauth/auth-code.ts`, `oauth/providers.ts`, `oauth/outbound-api-key.ts`)                    |
| **4 — Inbound MCP OAuth**     | `MCPOAuthServer` client_credentials + refresh rotation                                  | Issue/validate/refresh tests                                    | **Shipped** (`inbound/mcp-oauth.ts`) — HTTP route wiring in `mcp-api-adapter` / `server-http` still open |
| **5 — Vault + re-auth UX**    | HashiCorp Vault dynamic secrets; Hermes Telegram re-auth                                | Enterprise TEE + personal agent                                 | Spec                                                                                                     |

### Shipped slice (August 2026)

- **`IssuedApiKeyStore`**: issue `cqk_<id>_<secret>` once; salted SHA-256 only; org/team filters; `createClawQLAuth({ apiKeyStorePath })`.
- **`OAuthTokenStore`**: proactive refresh + single-flight mutex; `invalid_grant` → `ReauthRequiredError`.
- **`ClientCredentialsFlow` / `AuthorizationCodeFlow` (PKCE)** + provider catalogs.
- **`MCPOAuthServer`**: HS256 access JWTs with ATR claims; refresh-token rotation.
- Hosts inject **`AuthEventSink`** for WORM (no hard `clawql-audit` dependency yet).

Phases may land independently of full Vault / Hermes Telegram UX. Shipped OIDC **consumer** mode is untouched.

---

## 11. Package Dependencies

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

| Dependency                  | Role                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| **`clawql-audit`**          | Append-only auth WORM (`MCP_TOKEN_ISSUED`, `OAUTH_*`, `VAULT_*`) |
| **`jose`**                  | JWT sign/verify for `MCPOAuthServer` and shipped OIDC consumer   |
| **`node-vault`** (optional) | `VaultDynamicSecretProvider` — omit in slim browser/edge builds  |
| **`effect`**                | Existing — all new services expose `Effect` + `Layer`            |

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
