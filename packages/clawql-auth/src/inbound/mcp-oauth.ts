/**
 * Inbound MCP OAuth 2.1 authorization server (gateway-facing).
 * Issues short-lived access JWTs with ATR claims for MCP clients (Cursor, Cline, Claude Desktop).
 *
 * Supports Enterprise-Managed Authorization (EMA) via ID-JAG / Cross App Access —
 * org admins authorize the connector once at the IdP; users inherit access on first login.
 *
 * Effect-primary: all grant/validate/revoke methods return `Effect`. Express hosts use
 * thin `Effect.runPromise` façades in `http.ts` only.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";
import type { AtrClaims } from "../gateway.js";
import { generateCodeChallengeEffect } from "../oauth/auth-code.js";
import type { McpOAuthSigningMaterial } from "./mcp-oauth-signing.js";
import type { McpAuthorizationCodeStore } from "./mcp-auth-code-store.js";
import {
  ID_JAG_JWT_BEARER_GRANT,
  IdJagAuthError,
  atrClaimsFromIdJag,
  resolveGroupToScope,
  verifyIdJagAssertionEffect,
  type EmaConfigStore,
} from "./id-jag.js";
import { normalizeResourceIdEffect, resolveTokenAudienceEffect } from "./protected-resource.js";
import {
  createMemoryMcpGrantKeyStore,
  grantAsKeyEnabled,
  stampGrantVirtualKeyIdEffect,
} from "./mcp-grant-key-store.js";
import {
  DEVICE_CODE_GRANT,
  createDeviceAuthorizationEffect,
  type DeviceAuthorizationResponse,
  type DeviceCodeStore,
  type DeviceFlowConfig,
  DeviceFlowError,
} from "./mcp-device-flow.js";

export type McpGrantType =
  | "authorization_code"
  | "client_credentials"
  | "refresh_token"
  | "id_jag"
  | "device_code";

/** Wire-format grant types accepted at the token endpoint. */
export type McpGrantTypeInput =
  | McpGrantType
  | typeof ID_JAG_JWT_BEARER_GRANT
  | typeof DEVICE_CODE_GRANT;

export type MCPOAuthConfig = {
  issuer: string;
  /** Access token TTL (default 300s). */
  tokenTtlSeconds?: number;
  /** Refresh token TTL (default 3600s). */
  refreshTokenTtlSeconds?: number;
  allowedGrantTypes?: McpGrantType[];
  /** HS256 secret (dev / single-node). Prefer `signing` RS256 in production. */
  signingSecret?: string | Uint8Array;
  /** Resolved signing + verify keys (RS256 production or explicit HS256). */
  signing?: McpOAuthSigningMaterial;
  eventSink?: AuthEventSink;
  now?: () => number;
  /**
   * Canonical MCP protected-resource identifier / access-token `aud`
   * (RFC 8707 + RFC 9728). Also the default ID-JAG assertion audience when org
   * config does not override `audience`.
   */
  resourceAudience?: string;
  /** Org-level EMA config (IdP JWKS, group→scope mappings). Required for `id_jag`. */
  emaConfigStore?: EmaConfigStore;
  /** One-time auth codes for `authorization_code` + PKCE (non-EMA interactive path). */
  authCodeStore?: McpAuthorizationCodeStore;
  /**
   * Access-token hash index for revoke / denylist lookup.
   * When unset, a memory store is used so `accessTokenHash` WORM + revoke-by-access work in-process.
   */
  accessTokenStore?: McpAccessTokenStore;
  /** Auth code TTL seconds (default 300). */
  authCodeTtlSeconds?: number;
  /**
   * MCP OAuth §2 grant-as-key store. When set (or when
   * `CLAWQL_MCP_OAUTH_GRANT_AS_KEY` is on), access tokens stamp a
   * per-(subject, client, resource) `virtualKeyId` that is never the `clientId`.
   */
  grantKeyStore?: McpGrantKeyStore;
  /**
   * MCP OAuth §4 RFC 8628 device-code store. When set, `device_code` is accepted
   * and AS metadata may advertise `device_authorization_endpoint`.
   */
  deviceCodeStore?: DeviceCodeStore;
  /** Verification URI + TTLs for §4 device authorization (required with deviceCodeStore). */
  deviceFlow?: DeviceFlowConfig;
};

export type McpRegisteredClient = {
  clientId: string;
  /** Optional secret for client_credentials; omit for public clients. */
  clientSecretHash?: string;
  salt?: string;
  defaultScope: string[];
  defaultRole?: string;
  orgId?: string;
  teamId?: string;
  /** Allowed redirect URIs for `authorization_code` (exact match). */
  redirectUris?: string[];
};

export type McpTokenRequest = {
  grantType: McpGrantTypeInput;
  /** Required for client_credentials / refresh_token / authorization_code; optional for id_jag. */
  clientId?: string;
  clientSecret?: string;
  scope?: string[];
  refreshToken?: string;
  /** ID-JAG identity assertion JWT (EMA / Cross App Access). */
  assertion?: string;
  /** Org id for EMA group→scope lookup (falls back to assertion claim). */
  orgId?: string;
  /** Authorization code from `/oauth/authorize`. */
  code?: string;
  /** PKCE code_verifier pairing the authorize `code_challenge`. */
  codeVerifier?: string;
  /** Must match the redirect_uri used at authorize time. */
  redirectUri?: string;
  /** RFC 8707 resource indicator — must match {@link MCPOAuthConfig.resourceAudience} when set. */
  resource?: string;
  /** RFC 8628 device code from `/oauth/device_authorization`. */
  deviceCode?: string;
};

export type McpAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: "S256";
  scope?: string[];
  state?: string;
  /** RFC 8707 resource indicator bound into the auth code + access-token `aud`. */
  resource?: string;
  /** ATR claims already resolved from the human/session (API key / OIDC / MCP JWT). */
  claims: AtrClaims;
};

export type McpAuthorizeResult = {
  code: string;
  redirectUri: string;
  state?: string;
  /** Full redirect URL including code (+ state when present). */
  redirectUrl: string;
};

export type McpTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export type McpClientRegistry = {
  getClient: (clientId: string) => Effect.Effect<McpRegisteredClient | null>;
};

/** Persisted refresh-token record (hash-keyed). */
export type McpRefreshRecord = {
  clientId: string;
  scope: string[];
  expiresAtMs: number;
  /**
   * ATR claims snapshot from issuance (required for `authorization_code` so refresh
   * does not collapse the human subject back to the client id).
   */
  claims?: AtrClaims;
  /** RFC 8707 resource / access-token audience preserved across refresh. */
  resource?: string;
};

export type McpRefreshStore = {
  save: (refreshTokenHash: string, record: McpRefreshRecord) => Effect.Effect<void>;
  get: (refreshTokenHash: string) => Effect.Effect<McpRefreshRecord | null>;
  revoke: (refreshTokenHash: string) => Effect.Effect<void>;
};

/** Persisted access-token record (hash-keyed) for revoke / denylist lookup. */
export type McpAccessTokenRecord = {
  clientId: string;
  jti: string;
  expiresAtMs: number;
  revokedAtMs?: number;
};

export type McpAccessTokenStore = {
  save: (accessTokenHash: string, record: McpAccessTokenRecord) => Effect.Effect<void>;
  get: (accessTokenHash: string) => Effect.Effect<McpAccessTokenRecord | null>;
  revoke: (accessTokenHash: string) => Effect.Effect<void>;
};

/**
 * MCP OAuth §2 grant-as-key.
 *
 * One grant per (subject, client, resource). Access tokens stamp the grant's
 * `virtualKeyId` (never the OAuth `clientId`) so budgets, entitlements, revoke
 * and audit are per person (or per machine client for `client_credentials`).
 */
export type McpGrantKeyRecord = {
  /** Stamped as ATR `virtualKeyId`; never the `clientId`. */
  readonly virtualKeyId: string;
  /** Subject the grant was consented for (ATR `sub`). */
  readonly subject: string;
  readonly clientId: string;
  /** Normalized RFC 8707 resource the grant is bound to (§1 access-token `aud`). */
  readonly resource?: string;
  readonly orgId?: string;
  readonly scope: readonly string[];
  readonly grantType: Exclude<McpGrantType, "refresh_token">;
  readonly createdAtMs: number;
  readonly revokedAtMs?: number;
};

/** §2 store contract: one live grant per (subject, client, resource); revoking it ends its tokens. */
export type McpGrantKeyStore = {
  readonly getOrCreate: (
    grant: Omit<McpGrantKeyRecord, "virtualKeyId" | "createdAtMs" | "revokedAtMs">
  ) => Effect.Effect<McpGrantKeyRecord>;
  readonly get: (virtualKeyId: string) => Effect.Effect<McpGrantKeyRecord | null>;
  readonly revoke: (virtualKeyId: string) => Effect.Effect<void>;
};

/**
 * MCP OAuth §3 Client ID Metadata Documents (CIMD).
 * Trusted clients present a HTTPS `client_id` URL whose document is fetched and
 * pinned; only clients on the operator trusted-client list may resolve (see mcp-cimd.ts).
 */
export type McpTrustedClientRecord = {
  readonly clientIdUrl: string;
  readonly redirectUris: readonly string[];
  readonly trustedAtMs: number;
  readonly documentSha256?: string;
};

/**
 * MCP OAuth §4 device authorization (RFC 8628) pending record.
 * AS metadata advertises `device_authorization_endpoint` only when a store is wired.
 */
export type McpDeviceAuthorizationPending = {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly clientId: string;
  readonly expiresAtMs: number;
  readonly intervalSec: number;
  readonly approvedSubject?: string;
};

/** OAuth AS domain failure — maps to RFC 6749 error codes at the HTTP boundary. */
export class McpOAuthError extends Data.TaggedError("McpOAuthError")<{
  readonly error: string;
  readonly description?: string;
}> {
  override get message(): string {
    return this.description ? `${this.error}: ${this.description}` : this.error;
  }
}

function fail(error: string, description?: string): Effect.Effect<never, McpOAuthError> {
  return Effect.fail(new McpOAuthError({ error, description }));
}

function hashSecret(salt: string, value: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** SHA-256 hex of an access JWT — WORM correlation + revoke lookup key. */
export function hashMcpAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashMcpAccessTokenEffect(token: string): Effect.Effect<string> {
  return Effect.sync(() => hashMcpAccessToken(token));
}

function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

function toKey(secret: string | Uint8Array): Uint8Array {
  return typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
}

function normalizeGrantType(grantType: McpGrantTypeInput): McpGrantType {
  if (grantType === ID_JAG_JWT_BEARER_GRANT) return "id_jag";
  if (grantType === DEVICE_CODE_GRANT) return "device_code";
  return grantType;
}

export class MCPOAuthServer {
  private readonly tokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly authCodeTtlSeconds: number;
  private readonly allowedGrantTypes: Set<McpGrantType>;
  private readonly eventSink: AuthEventSink;
  private readonly now: () => number;
  private readonly signing: McpOAuthSigningMaterial;
  private readonly emaConfigStore?: EmaConfigStore;
  private readonly authCodeStore?: McpAuthorizationCodeStore;
  private readonly accessTokenStore: McpAccessTokenStore;
  private readonly grantKeyStore?: McpGrantKeyStore;
  private readonly grantAsKey: boolean;
  private readonly deviceCodeStore?: DeviceCodeStore;
  private readonly deviceFlowConfig?: DeviceFlowConfig;

  constructor(
    private readonly config: MCPOAuthConfig,
    private readonly clients: McpClientRegistry,
    private readonly refreshStore: McpRefreshStore
  ) {
    this.tokenTtlSeconds = config.tokenTtlSeconds ?? 300;
    this.refreshTokenTtlSeconds = config.refreshTokenTtlSeconds ?? 3600;
    this.authCodeTtlSeconds = config.authCodeTtlSeconds ?? 300;
    const defaults: McpGrantType[] = ["client_credentials", "refresh_token", "id_jag"];
    if (config.authCodeStore) defaults.push("authorization_code");
    if (config.deviceCodeStore && config.deviceFlow) defaults.push("device_code");
    this.allowedGrantTypes = new Set(config.allowedGrantTypes ?? defaults);
    this.eventSink = config.eventSink ?? noopAuthEventSink;
    this.now = config.now ?? Date.now;
    this.signing = resolveSigningMaterial(config);
    this.emaConfigStore = config.emaConfigStore;
    this.authCodeStore = config.authCodeStore;
    this.accessTokenStore = config.accessTokenStore ?? createMemoryMcpAccessTokenStore();
    const explicitStore = config.grantKeyStore != null;
    this.grantAsKey = grantAsKeyEnabled(process.env, explicitStore);
    this.grantKeyStore = this.grantAsKey
      ? (config.grantKeyStore ?? createMemoryMcpGrantKeyStore(this.now))
      : undefined;
    this.deviceCodeStore = config.deviceCodeStore;
    this.deviceFlowConfig = config.deviceFlow
      ? { ...config.deviceFlow, now: config.deviceFlow.now ?? this.now }
      : undefined;
  }

  /** JWKS for RS256 verification (empty for HS256). */
  getJwks(): McpOAuthSigningMaterial["jwks"] {
    return this.signing.jwks;
  }

  /** Grant types this AS will accept (includes `authorization_code` / `device_code` when wired). */
  getSupportedGrantTypes(): McpGrantType[] {
    return [...this.allowedGrantTypes];
  }

  /** True when RFC 8628 device authorization is configured on this AS. */
  isDeviceFlowEnabled(): boolean {
    return Boolean(
      this.deviceCodeStore &&
        this.deviceFlowConfig &&
        this.allowedGrantTypes.has("device_code")
    );
  }

  issueToken(request: McpTokenRequest): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      const grantType = normalizeGrantType(request.grantType);
      if (!this.allowedGrantTypes.has(grantType)) {
        return yield* fail("unsupported_grant_type", String(request.grantType));
      }

      if (grantType === "refresh_token") {
        return yield* this.refreshAccessToken(request);
      }
      if (grantType === "client_credentials") {
        return yield* this.issueClientCredentials(request);
      }
      if (grantType === "id_jag") {
        return yield* this.exchangeIdJag(request);
      }
      if (grantType === "authorization_code") {
        return yield* this.exchangeAuthorizationCode(request);
      }
      if (grantType === "device_code") {
        return yield* this.exchangeDeviceCode(request);
      }
      return yield* fail("unsupported_grant_type");
    });
  }

  /**
   * RFC 8628 device authorization request — issues `device_code` + `user_code`.
   */
  createDeviceAuthorization(
    clientId: string
  ): Effect.Effect<DeviceAuthorizationResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!this.deviceCodeStore || !this.deviceFlowConfig) {
        return yield* fail("invalid_request", "device_authorization_not_configured");
      }
      if (!this.allowedGrantTypes.has("device_code")) {
        return yield* fail("unsupported_grant_type", "device_code");
      }
      const id = clientId?.trim();
      if (!id) return yield* fail("invalid_client");
      const client = yield* this.clients.getClient(id);
      if (!client) return yield* fail("invalid_client");
      return yield* createDeviceAuthorizationEffect(
        this.deviceCodeStore,
        this.deviceFlowConfig,
        client.clientId
      );
    });
  }

  /**
   * Operator/user approval of a pending device `user_code` (after login).
   * ClawQL is not a login IdP — caller supplies ATR claims from API key / OIDC / MCP JWT.
   */
  approveDeviceAuthorization(
    userCode: string,
    subject: string
  ): Effect.Effect<void, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!this.deviceCodeStore) {
        return yield* fail("invalid_request", "device_authorization_not_configured");
      }
      const code = userCode?.trim();
      const sub = subject?.trim();
      if (!code || !sub) return yield* fail("invalid_request", "missing_user_code_or_subject");
      yield* this.deviceCodeStore.approve(code, sub).pipe(
        Effect.mapError(
          (err: DeviceFlowError) =>
            new McpOAuthError({ error: err.error, description: err.description })
        )
      );
    });
  }

  /**
   * Start interactive `authorization_code` (PKCE S256).
   * ClawQL is not a login IdP — caller must already supply ATR claims from API key / OIDC / MCP JWT.
   */
  createAuthorizationCode(
    request: McpAuthorizeRequest
  ): Effect.Effect<McpAuthorizeResult, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!this.authCodeStore) {
        return yield* fail("invalid_request", "authorization_code_not_configured");
      }
      if (!this.allowedGrantTypes.has("authorization_code")) {
        return yield* fail("unsupported_grant_type", "authorization_code");
      }

      const clientId = request.clientId?.trim();
      const redirectUri = request.redirectUri?.trim();
      const codeChallenge = request.codeChallenge?.trim();
      if (!clientId) return yield* fail("invalid_request", "missing client_id");
      if (!redirectUri) return yield* fail("invalid_request", "missing redirect_uri");
      if (!codeChallenge) return yield* fail("invalid_request", "missing code_challenge");
      if (request.codeChallengeMethod && request.codeChallengeMethod !== "S256") {
        return yield* fail("invalid_request", "code_challenge_method_must_be_S256");
      }
      if (!request.claims?.sub) return yield* fail("invalid_request", "missing_subject_claims");

      const client = yield* this.clients.getClient(clientId);
      if (!client) return yield* fail("invalid_client");
      const allowed = client.redirectUris ?? [];
      if (allowed.length === 0 || !allowed.includes(redirectUri)) {
        return yield* fail("invalid_request", "redirect_uri_not_registered");
      }

      const resource = yield* this.resolveAudience(request.resource);

      const scope =
        request.scope?.length && request.scope.length > 0
          ? intersectScopes(
              request.claims.scope?.length ? request.claims.scope : client.defaultScope,
              request.scope
            )
          : request.claims.scope?.length
            ? request.claims.scope
            : client.defaultScope;
      if (scope.length === 0) return yield* fail("invalid_scope");

      const code = `mca_${randomBytes(24).toString("base64url")}`;
      const codeHash = hashRefreshToken(code);
      const nowMs = this.now();
      yield* this.authCodeStore.save(codeHash, {
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod: "S256",
        scope,
        claims: { ...request.claims, scope },
        ...(resource ? { resource } : {}),
        expiresAtMs: nowMs + this.authCodeTtlSeconds * 1000,
        createdAtMs: nowMs,
      });

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (request.state?.trim()) redirect.searchParams.set("state", request.state.trim());

      return {
        code,
        redirectUri,
        state: request.state?.trim() || undefined,
        redirectUrl: redirect.toString(),
      };
    });
  }

  private exchangeAuthorizationCode(
    request: McpTokenRequest
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!this.authCodeStore) {
        return yield* fail("invalid_request", "authorization_code_not_configured");
      }
      if (!request.clientId?.trim()) return yield* fail("invalid_client");
      if (!request.code?.trim()) return yield* fail("invalid_request", "missing code");
      if (!request.codeVerifier?.trim()) {
        return yield* fail("invalid_request", "missing code_verifier");
      }
      if (!request.redirectUri?.trim()) {
        return yield* fail("invalid_request", "missing redirect_uri");
      }

      const client = yield* this.clients.getClient(request.clientId.trim());
      if (!client) return yield* fail("invalid_client");
      yield* this.assertClientSecret(client, request.clientSecret);

      const codeHash = hashRefreshToken(request.code.trim());
      const stored = yield* this.authCodeStore.consume(codeHash);
      if (!stored || stored.expiresAtMs <= this.now()) {
        return yield* fail("invalid_grant", "code_expired_or_missing");
      }
      if (stored.clientId !== request.clientId.trim()) {
        return yield* fail("invalid_grant", "client_mismatch");
      }
      if (stored.redirectUri !== request.redirectUri.trim()) {
        return yield* fail("invalid_grant", "redirect_uri_mismatch");
      }

      const challenge = yield* generateCodeChallengeEffect(request.codeVerifier.trim());
      if (challenge !== stored.codeChallenge) {
        return yield* fail("invalid_grant", "pkce_failed");
      }

      const scope = request.scope?.length
        ? intersectScopes(stored.scope, request.scope)
        : stored.scope;
      if (scope.length === 0) return yield* fail("invalid_scope");

      const resource = yield* this.resolveAudience(request.resource ?? stored.resource);
      const claims = yield* this.buildAtrClaimsEffect(client, scope, {
        subject: stored.claims.sub || request.clientId.trim(),
        grantType: "authorization_code",
        resource,
        base: { ...stored.claims, scope },
      });
      return yield* this.mintTokens(request.clientId.trim(), claims, scope, {
        grantType: "authorization_code",
        includeRefresh: true,
        resource,
        audit: {
          subjectId: claims.sub,
          orgId: claims.orgId,
          role: claims.role,
        },
      });
    });
  }

  /**
   * Exchange an IdP-issued ID-JAG assertion for a ClawQL MCP access token.
   * Zero per-user consent — scope derives from admin-configured IdP group mappings.
   */
  exchangeIdJag(request: McpTokenRequest): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!request.assertion?.trim()) {
        return yield* fail("invalid_request", "missing assertion");
      }
      if (!this.emaConfigStore) {
        return yield* fail("invalid_request", "ema_not_configured");
      }

      const assertion = request.assertion.trim();
      let orgId = request.orgId?.trim();
      if (!orgId) {
        orgId = (yield* this.peekAssertionOrgId(assertion)) ?? undefined;
      }
      if (!orgId) {
        return yield* fail("invalid_request", "missing org_id");
      }

      const emaConfig = yield* this.emaConfigStore.getOrgConfig(orgId);
      if (!emaConfig) {
        return yield* fail("invalid_request", "unknown_org");
      }

      const audience = emaConfig.audience ?? this.config.resourceAudience;
      if (!audience) {
        return yield* fail("invalid_request", "ema_audience_not_configured");
      }

      const verified = yield* verifyIdJagAssertionEffect(assertion, {
        ...emaConfig,
        audience,
      }).pipe(
        Effect.mapError(
          (err: IdJagAuthError) =>
            new McpOAuthError({ error: "invalid_grant", description: err.reason })
        )
      );

      let resolved;
      try {
        resolved = resolveGroupToScope(verified.groups, emaConfig.groupMappings, {
          scope: emaConfig.defaultScope,
          role: emaConfig.defaultRole,
        });
      } catch (cause) {
        if (cause instanceof IdJagAuthError) {
          return yield* fail("invalid_grant", cause.reason);
        }
        throw cause;
      }

      const claims = atrClaimsFromIdJag(verified, resolved);
      const scope = request.scope?.length
        ? intersectScopes(resolved.scope, request.scope)
        : resolved.scope;

      if (scope.length === 0) {
        return yield* fail("invalid_scope");
      }

      const clientId = request.clientId?.trim() || verified.sub;
      // ID-JAG assertion `aud` may be multi-valued; access-token `aud` is a single resource id.
      const fallbackResource = Array.isArray(audience) ? audience[0] : audience;
      const resource = yield* this.resolveAudience(request.resource ?? fallbackResource);
      let finalClaims: AtrClaims = { ...claims, scope };
      if (this.grantKeyStore) {
        const virtualKeyId = yield* stampGrantVirtualKeyIdEffect(this.grantKeyStore, {
          subject: verified.sub,
          clientId,
          resource,
          orgId: verified.orgId ?? claims.orgId,
          scope,
          grantType: "id_jag",
        });
        finalClaims = { ...finalClaims, virtualKeyId };
      }

      return yield* this.mintTokens(clientId, finalClaims, scope, {
        grantType: "id_jag",
        includeRefresh: false,
        resource,
        audit: {
          subjectId: verified.sub,
          orgId: verified.orgId,
          idpGroups: verified.groups,
          matchedIdpGroups: resolved.matchedGroups,
          role: resolved.role,
          idJagJti: verified.jti,
        },
      });
    });
  }

  private peekAssertionOrgId(assertion: string): Effect.Effect<string | null> {
    return Effect.sync(() => {
      try {
        const parts = assertion.split(".");
        if (parts.length < 2) return null;
        const payload = JSON.parse(
          Buffer.from(parts[1]!, "base64url").toString("utf8")
        ) as JWTPayload;
        const orgRaw = payload.org_id ?? payload.orgId;
        return typeof orgRaw === "string" && orgRaw.trim() ? orgRaw.trim() : null;
      } catch {
        return null;
      }
    });
  }

  private exchangeDeviceCode(
    request: McpTokenRequest
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!this.deviceCodeStore) {
        return yield* fail("invalid_request", "device_authorization_not_configured");
      }
      const deviceCode = request.deviceCode?.trim();
      if (!deviceCode) return yield* fail("invalid_request", "missing_device_code");
      if (!request.clientId?.trim()) return yield* fail("invalid_client");

      const client = yield* this.clients.getClient(request.clientId.trim());
      if (!client) return yield* fail("invalid_client");
      yield* this.assertClientSecret(client, request.clientSecret);

      const pending = yield* this.deviceCodeStore.consumeApproved(deviceCode).pipe(
        Effect.mapError(
          (err: DeviceFlowError) =>
            new McpOAuthError({ error: err.error, description: err.description })
        )
      );
      if (pending.clientId !== client.clientId) {
        return yield* fail("invalid_grant", "client_mismatch");
      }
      const subject = pending.approvedSubject?.trim();
      if (!subject) return yield* fail("authorization_pending");

      const scope = request.scope?.length ? request.scope : client.defaultScope;
      const resource = yield* this.resolveAudience(request.resource);
      const claims = yield* this.buildAtrClaimsEffect(client, scope, {
        subject,
        grantType: "device_code",
        resource,
      });
      return yield* this.mintTokens(client.clientId, claims, scope, {
        grantType: "device_code",
        includeRefresh: true,
        resource,
        audit: { subjectId: subject, orgId: client.orgId, role: claims.role },
      });
    });
  }

  private issueClientCredentials(
    request: McpTokenRequest
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!request.clientId) return yield* fail("invalid_client");
      const client = yield* this.clients.getClient(request.clientId);
      if (!client) return yield* fail("invalid_client");
      yield* this.assertClientSecret(client, request.clientSecret);

      const scope = request.scope?.length ? request.scope : client.defaultScope;
      const resource = yield* this.resolveAudience(request.resource);
      const claims = yield* this.buildAtrClaimsEffect(client, scope, {
        subject: `client:${client.clientId}`,
        grantType: "client_credentials",
        resource,
      });
      return yield* this.mintTokens(client.clientId, claims, scope, {
        grantType: "client_credentials",
        includeRefresh: true,
        resource,
      });
    });
  }

  private refreshAccessToken(
    request: McpTokenRequest
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      if (!request.clientId) return yield* fail("invalid_client");
      if (!request.refreshToken) return yield* fail("invalid_request");
      const hash = hashRefreshToken(request.refreshToken);
      const stored = yield* this.refreshStore.get(hash);
      if (!stored || stored.expiresAtMs <= this.now()) {
        yield* emitAuthEventEffect(this.eventSink, {
          type: "MCP_TOKEN_VALIDATION_FAILED",
          reason: "refresh_expired_or_missing",
          timestamp: new Date(this.now()).toISOString(),
        });
        return yield* fail("invalid_grant");
      }
      if (stored.clientId !== request.clientId) return yield* fail("invalid_grant");

      const client = yield* this.clients.getClient(request.clientId);
      if (!client) return yield* fail("invalid_client");
      yield* this.assertClientSecret(client, request.clientSecret);

      yield* this.refreshStore.revoke(hash);

      const scope = request.scope?.length
        ? intersectScopes(stored.scope, request.scope)
        : stored.scope;
      if (scope.length === 0) return yield* fail("invalid_scope");

      const resource = yield* this.resolveAudience(request.resource ?? stored.resource);
      let claims: AtrClaims;
      if (stored.claims) {
        claims = { ...stored.claims, scope };
        if (this.grantKeyStore && (!claims.virtualKeyId || claims.virtualKeyId === client.clientId)) {
          claims = yield* this.buildAtrClaimsEffect(client, scope, {
            subject: claims.sub || `client:${client.clientId}`,
            grantType: "client_credentials",
            resource,
            base: claims,
          });
        }
      } else {
        claims = yield* this.buildAtrClaimsEffect(client, scope, {
          subject: `client:${client.clientId}`,
          grantType: "client_credentials",
          resource,
        });
      }

      const response = yield* this.mintTokens(client.clientId, claims, scope, {
        grantType: "refresh_token",
        includeRefresh: true,
        resource,
        audit: {
          subjectId: claims.sub,
          orgId: claims.orgId,
          role: claims.role,
        },
      });

      yield* emitAuthEventEffect(this.eventSink, {
        type: "MCP_TOKEN_REFRESHED",
        clientId: client.clientId,
        expiresAt: new Date(this.now() + this.tokenTtlSeconds * 1000).toISOString(),
        timestamp: new Date(this.now()).toISOString(),
      });

      return response;
    });
  }

  private assertClientSecret(
    client: McpRegisteredClient,
    clientSecret: string | undefined
  ): Effect.Effect<void, McpOAuthError> {
    if (!client.clientSecretHash) return Effect.void;
    if (!clientSecret || !client.salt) return fail("invalid_client");
    const secretHash = hashSecret(client.salt, clientSecret);
    if (!secretsEqual(secretHash, client.clientSecretHash)) return fail("invalid_client");
    return Effect.void;
  }

  /**
   * RFC 8707: bind access-token `aud` to the canonical MCP resource.
   * Rejects a mismatched `resource` parameter when a canonical audience is configured.
   */
  private resolveAudience(
    requestedResource: string | undefined
  ): Effect.Effect<string | undefined, McpOAuthError> {
    return resolveTokenAudienceEffect(requestedResource, this.config.resourceAudience).pipe(
      Effect.mapError(
        () =>
          new McpOAuthError({
            error: "invalid_target",
            description: "resource_mismatch",
          })
      )
    );
  }

  /**
   * Build ATR claims, stamping §2 grant `virtualKeyId` when grant-as-key is on.
   * Legacy fallback (flag off): `virtualKeyId = clientId`.
   */
  private buildAtrClaimsEffect(
    client: McpRegisteredClient,
    scope: string[],
    opts: {
      readonly subject: string;
      readonly grantType: Exclude<McpGrantType, "refresh_token">;
      readonly resource?: string;
      readonly base?: AtrClaims;
    }
  ): Effect.Effect<AtrClaims> {
    return Effect.gen({ self: this }, function* () {
      const base: AtrClaims = opts.base ?? {
        sub: opts.subject.startsWith("client:") ? client.clientId : opts.subject,
        role: client.defaultRole ?? "operator",
        scope,
        orgId: client.orgId,
        tenantId: client.orgId,
      };
      if (!this.grantKeyStore) {
        return {
          ...base,
          scope,
          virtualKeyId: base.virtualKeyId ?? client.clientId,
        };
      }
      const virtualKeyId = yield* stampGrantVirtualKeyIdEffect(this.grantKeyStore, {
        subject: opts.subject,
        clientId: client.clientId,
        resource: opts.resource,
        orgId: base.orgId ?? client.orgId,
        scope,
        grantType: opts.grantType,
      });
      return { ...base, scope, virtualKeyId };
    });
  }

  private mintTokens(
    clientId: string,
    claims: AtrClaims,
    scope: string[],
    options: {
      grantType: string;
      includeRefresh: boolean;
      /** RFC 8707 / access-token `aud`. */
      resource?: string;
      audit?: {
        subjectId?: string;
        orgId?: string;
        idpGroups?: string[];
        matchedIdpGroups?: string[];
        role?: string;
        idJagJti?: string;
      };
    }
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      const expiresAt = this.now() + this.tokenTtlSeconds * 1000;
      const jti = randomBytes(12).toString("hex");
      const rawAudience = options.resource?.trim() || this.config.resourceAudience?.trim();
      const audience = rawAudience ? yield* normalizeResourceIdEffect(rawAudience) : undefined;
      const accessToken = yield* Effect.tryPromise({
        try: () => {
          let jwt = new SignJWT({
            atr: claims,
            scope: scope.join(" "),
            jti,
          } as JWTPayload)
            .setProtectedHeader({
              alg: this.signing.algorithm,
              ...(this.signing.keyId ? { kid: this.signing.keyId } : {}),
            })
            .setSubject(claims.sub)
            .setIssuer(this.config.issuer)
            .setIssuedAt(Math.floor(this.now() / 1000))
            .setExpirationTime(Math.floor(expiresAt / 1000));
          if (audience) jwt = jwt.setAudience(audience);
          return jwt.sign(this.signing.signKey);
        },
        catch: (cause) =>
          new McpOAuthError({
            error: "server_error",
            description: cause instanceof Error ? cause.message : "sign_failed",
          }),
      });

      const accessTokenHash = hashMcpAccessToken(accessToken);
      yield* this.accessTokenStore.save(accessTokenHash, {
        clientId,
        jti,
        expiresAtMs: expiresAt,
      });

      let refresh_token: string | undefined;
      if (options.includeRefresh) {
        refresh_token = `mcr_${randomBytes(32).toString("base64url")}`;
        yield* this.refreshStore.save(hashRefreshToken(refresh_token), {
          clientId,
          scope,
          expiresAtMs: this.now() + this.refreshTokenTtlSeconds * 1000,
          claims: { ...claims, scope },
          ...(audience ? { resource: audience } : {}),
        });
      }

      yield* emitAuthEventEffect(this.eventSink, {
        type: "MCP_TOKEN_ISSUED",
        clientId,
        grantType: options.grantType,
        scope,
        expiresAt: new Date(expiresAt).toISOString(),
        timestamp: new Date(this.now()).toISOString(),
        subjectId: options.audit?.subjectId,
        orgId: options.audit?.orgId ?? claims.orgId,
        role: options.audit?.role ?? claims.role,
        idpGroups: options.audit?.idpGroups ?? claims.idpGroups,
        matchedIdpGroups: options.audit?.matchedIdpGroups,
        idJagJti: options.audit?.idJagJti,
        accessTokenHash,
      });

      return {
        access_token: accessToken,
        token_type: "Bearer" as const,
        expires_in: this.tokenTtlSeconds,
        refresh_token,
        scope: scope.join(" "),
      };
    });
  }

  /**
   * Validate Bearer access token; returns ATR claims for Panguard / gateway.
   * Rejects tokens present in the access-token store as revoked.
   */
  validateToken(bearerToken: string): Effect.Effect<AtrClaims, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      const rawAud = this.config.resourceAudience?.trim();
      const expectedAud = rawAud ? yield* normalizeResourceIdEffect(rawAud) : undefined;
      const atr = yield* Effect.tryPromise({
        try: async () => {
          const { payload } = await jwtVerify(bearerToken, this.signing.verifyKey, {
            issuer: this.config.issuer,
            algorithms: [this.signing.algorithm],
            ...(expectedAud ? { audience: expectedAud } : {}),
          });
          const claims = payload.atr as AtrClaims | undefined;
          if (!claims || typeof claims !== "object" || !claims.sub) {
            throw new Error("missing atr claim");
          }
          return claims;
        },
        catch: (cause) =>
          new McpOAuthError({
            error: "invalid_token",
            description: cause instanceof Error ? cause.message : "verify_failed",
          }),
      }).pipe(
        Effect.tapError((err) =>
          emitAuthEventEffect(this.eventSink, {
            type: "MCP_TOKEN_VALIDATION_FAILED",
            reason: err.description ?? err.error,
            timestamp: new Date(this.now()).toISOString(),
          })
        )
      );

      const accessHash = hashMcpAccessToken(bearerToken);
      const indexed = yield* this.accessTokenStore.get(accessHash);
      if (indexed?.revokedAtMs != null) {
        yield* emitAuthEventEffect(this.eventSink, {
          type: "MCP_TOKEN_VALIDATION_FAILED",
          reason: "token_revoked",
          timestamp: new Date(this.now()).toISOString(),
        });
        return yield* fail("invalid_token", "token_revoked");
      }

      return atr;
    });
  }

  /**
   * RFC 7009-style revocation for refresh tokens **and** access JWTs (hash denylist).
   * Unknown / already-revoked tokens succeed (no information leak).
   */
  revokeToken(input: {
    token: string;
    clientId?: string;
    clientSecret?: string;
  }): Effect.Effect<void, McpOAuthError> {
    return Effect.gen({ self: this }, function* () {
      const token = input.token?.trim();
      if (!token) return yield* fail("invalid_request", "missing token");

      const refreshHash = hashRefreshToken(token);
      const refreshStored = yield* this.refreshStore.get(refreshHash);
      if (refreshStored) {
        const clientId = input.clientId?.trim() || refreshStored.clientId;
        if (refreshStored.clientId !== clientId) return yield* fail("invalid_grant");

        const client = yield* this.clients.getClient(clientId);
        if (client?.clientSecretHash) {
          yield* this.assertClientSecret(client, input.clientSecret);
        }

        yield* this.refreshStore.revoke(refreshHash);
        yield* emitAuthEventEffect(this.eventSink, {
          type: "MCP_TOKEN_REVOKED",
          clientId,
          reason: "client_revoke",
          timestamp: new Date(this.now()).toISOString(),
        });
        return;
      }

      const accessHash = hashMcpAccessToken(token);
      const accessStored = yield* this.accessTokenStore.get(accessHash);
      if (!accessStored) return;

      const clientId = input.clientId?.trim() || accessStored.clientId;
      if (accessStored.clientId !== clientId) return yield* fail("invalid_grant");

      const client = yield* this.clients.getClient(clientId);
      if (client?.clientSecretHash) {
        yield* this.assertClientSecret(client, input.clientSecret);
      }

      yield* this.accessTokenStore.revoke(accessHash);
      yield* emitAuthEventEffect(this.eventSink, {
        type: "MCP_TOKEN_REVOKED",
        clientId,
        reason: "client_revoke_access",
        timestamp: new Date(this.now()).toISOString(),
        accessTokenHash: accessHash,
      });
    });
  }
}

function intersectScopes(allowed: string[], requested: string[]): string[] {
  const allow = new Set(allowed);
  return requested.filter((s) => allow.has(s));
}

function resolveSigningMaterial(config: MCPOAuthConfig): McpOAuthSigningMaterial {
  if (config.signing) return config.signing;
  if (config.signingSecret) {
    const key = toKey(config.signingSecret);
    return {
      algorithm: "HS256",
      signKey: key,
      verifyKey: key,
      jwks: { keys: [] },
    };
  }
  throw new Error("MCPOAuthConfig requires signing or signingSecret");
}

export function createMCPOAuthServer(
  config: MCPOAuthConfig,
  clients: McpClientRegistry,
  refreshStore: McpRefreshStore
): MCPOAuthServer {
  return new MCPOAuthServer(config, clients, refreshStore);
}

export const CLAWQL_MCP_OAUTH_SERVICE_TAG = "clawql/McpOAuthService" as const;

export class McpOAuthService extends Context.Service<
  McpOAuthService,
  {
    readonly server: MCPOAuthServer;
    readonly issueToken: (
      request: McpTokenRequest
    ) => Effect.Effect<McpTokenResponse, McpOAuthError>;
    readonly createAuthorizationCode: (
      request: McpAuthorizeRequest
    ) => Effect.Effect<McpAuthorizeResult, McpOAuthError>;
    readonly validateToken: (bearerToken: string) => Effect.Effect<AtrClaims, McpOAuthError>;
    readonly revokeToken: (input: {
      token: string;
      clientId?: string;
      clientSecret?: string;
    }) => Effect.Effect<void, McpOAuthError>;
    readonly exchangeIdJag: (
      request: McpTokenRequest
    ) => Effect.Effect<McpTokenResponse, McpOAuthError>;
  }
>()(CLAWQL_MCP_OAUTH_SERVICE_TAG) {}

export function mcpOAuthServiceFromServer(server: MCPOAuthServer) {
  return McpOAuthService.of({
    server,
    issueToken: (request) => server.issueToken(request),
    createAuthorizationCode: (request) => server.createAuthorizationCode(request),
    validateToken: (bearerToken) => server.validateToken(bearerToken),
    revokeToken: (input) => server.revokeToken(input),
    exchangeIdJag: (request) => server.exchangeIdJag(request),
  });
}

export function createMcpOAuthServiceLayer(server: MCPOAuthServer): Layer.Layer<McpOAuthService> {
  return Layer.succeed(McpOAuthService, mcpOAuthServiceFromServer(server));
}

export function hashMcpClientSecretEffect(salt: string, secret: string): Effect.Effect<string> {
  return Effect.sync(() => hashSecret(salt, secret));
}

/** @deprecated Prefer {@link hashMcpClientSecretEffect}; kept for bootstrap JSON helpers. */
export function hashMcpClientSecret(salt: string, secret: string): string {
  return hashSecret(salt, secret);
}

export function createMemoryMcpClientRegistry(
  clients: McpRegisteredClient[]
): McpClientRegistry & { readonly list: McpRegisteredClient[] } {
  const map = new Map(clients.map((c) => [c.clientId, c]));
  return {
    list: clients,
    getClient: (clientId) => Effect.sync(() => map.get(clientId) ?? null),
  };
}

export function createMemoryMcpRefreshStore(): McpRefreshStore & {
  readonly map: Map<string, McpRefreshRecord>;
} {
  const map = new Map<string, McpRefreshRecord>();
  return {
    map,
    save: (hash, record) =>
      Effect.sync(() => {
        map.set(hash, record);
      }),
    get: (hash) => Effect.sync(() => map.get(hash) ?? null),
    revoke: (hash) =>
      Effect.sync(() => {
        map.delete(hash);
      }),
  };
}

export function createMemoryMcpAccessTokenStore(): McpAccessTokenStore & {
  readonly map: Map<string, McpAccessTokenRecord>;
} {
  const map = new Map<string, McpAccessTokenRecord>();
  return {
    map,
    save: (hash, record) =>
      Effect.sync(() => {
        map.set(hash, record);
      }),
    get: (hash) => Effect.sync(() => map.get(hash) ?? null),
    revoke: (hash) =>
      Effect.sync(() => {
        const existing = map.get(hash);
        if (existing) {
          map.set(hash, { ...existing, revokedAtMs: Date.now() });
        }
      }),
  };
}

export { ID_JAG_JWT_BEARER_GRANT } from "./id-jag.js";
export { DEVICE_CODE_GRANT } from "./mcp-device-flow.js";
