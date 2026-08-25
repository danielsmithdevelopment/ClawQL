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

import { emitAuthEventEffect, noopAuthEventSink, type AuthEventSink } from "../audit/auth-events.js";
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

export type McpGrantType = "authorization_code" | "client_credentials" | "refresh_token" | "id_jag";

/** Wire-format grant types accepted at the token endpoint. */
export type McpGrantTypeInput = McpGrantType | typeof ID_JAG_JWT_BEARER_GRANT;

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
   * Default ClawQL MCP resource audience for ID-JAG assertions when org config
   * does not override `audience`.
   */
  resourceAudience?: string;
  /** Org-level EMA config (IdP JWKS, group→scope mappings). Required for `id_jag`. */
  emaConfigStore?: EmaConfigStore;
  /** One-time auth codes for `authorization_code` + PKCE (non-EMA interactive path). */
  authCodeStore?: McpAuthorizationCodeStore;
  /** Auth code TTL seconds (default 300). */
  authCodeTtlSeconds?: number;
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
};

export type McpAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: "S256";
  scope?: string[];
  state?: string;
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
};

export type McpRefreshStore = {
  save: (refreshTokenHash: string, record: McpRefreshRecord) => Effect.Effect<void>;
  get: (refreshTokenHash: string) => Effect.Effect<McpRefreshRecord | null>;
  revoke: (refreshTokenHash: string) => Effect.Effect<void>;
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
    this.allowedGrantTypes = new Set(config.allowedGrantTypes ?? defaults);
    this.eventSink = config.eventSink ?? noopAuthEventSink;
    this.now = config.now ?? Date.now;
    this.signing = resolveSigningMaterial(config);
    this.emaConfigStore = config.emaConfigStore;
    this.authCodeStore = config.authCodeStore;
  }

  /** JWKS for RS256 verification (empty for HS256). */
  getJwks(): McpOAuthSigningMaterial["jwks"] {
    return this.signing.jwks;
  }

  /** Grant types this AS will accept (includes `authorization_code` when a code store is wired). */
  getSupportedGrantTypes(): McpGrantType[] {
    return [...this.allowedGrantTypes];
  }

  issueToken(request: McpTokenRequest): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen(this, function* () {
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
      return yield* fail("unsupported_grant_type");
    });
  }

  /**
   * Start interactive `authorization_code` (PKCE S256).
   * ClawQL is not a login IdP — caller must already supply ATR claims from API key / OIDC / MCP JWT.
   */
  createAuthorizationCode(
    request: McpAuthorizeRequest
  ): Effect.Effect<McpAuthorizeResult, McpOAuthError> {
    return Effect.gen(this, function* () {
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
    return Effect.gen(this, function* () {
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

      const claims: AtrClaims = { ...stored.claims, scope };
      return yield* this.mintTokens(request.clientId.trim(), claims, scope, {
        grantType: "authorization_code",
        includeRefresh: true,
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
    return Effect.gen(this, function* () {
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
        Effect.mapError((err: IdJagAuthError) => new McpOAuthError({ error: "invalid_grant", description: err.reason }))
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

      const finalClaims: AtrClaims = { ...claims, scope };
      const clientId = request.clientId?.trim() || verified.sub;

      return yield* this.mintTokens(clientId, finalClaims, scope, {
        grantType: "id_jag",
        includeRefresh: false,
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

  private issueClientCredentials(
    request: McpTokenRequest
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen(this, function* () {
      if (!request.clientId) return yield* fail("invalid_client");
      const client = yield* this.clients.getClient(request.clientId);
      if (!client) return yield* fail("invalid_client");
      yield* this.assertClientSecret(client, request.clientSecret);

      const scope = request.scope?.length ? request.scope : client.defaultScope;
      const claims = this.buildAtrClaims(client, scope);
      return yield* this.mintTokens(client.clientId, claims, scope, {
        grantType: "client_credentials",
        includeRefresh: true,
      });
    });
  }

  private refreshAccessToken(
    request: McpTokenRequest
  ): Effect.Effect<McpTokenResponse, McpOAuthError> {
    return Effect.gen(this, function* () {
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

      const claims: AtrClaims = stored.claims
        ? { ...stored.claims, scope }
        : this.buildAtrClaims(client, scope);

      const response = yield* this.mintTokens(client.clientId, claims, scope, {
        grantType: "refresh_token",
        includeRefresh: true,
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

  private buildAtrClaims(client: McpRegisteredClient, scope: string[]): AtrClaims {
    return {
      sub: client.clientId,
      role: client.defaultRole ?? "operator",
      scope,
      orgId: client.orgId,
      tenantId: client.orgId,
      virtualKeyId: client.clientId,
    };
  }

  private mintTokens(
    clientId: string,
    claims: AtrClaims,
    scope: string[],
    options: {
      grantType: string;
      includeRefresh: boolean;
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
    return Effect.gen(this, function* () {
      const expiresAt = this.now() + this.tokenTtlSeconds * 1000;
      const accessToken = yield* Effect.tryPromise({
        try: () =>
          new SignJWT({
            atr: claims,
            scope: scope.join(" "),
            jti: randomBytes(12).toString("hex"),
          } as JWTPayload)
            .setProtectedHeader({
              alg: this.signing.algorithm,
              ...(this.signing.keyId ? { kid: this.signing.keyId } : {}),
            })
            .setSubject(claims.sub)
            .setIssuer(this.config.issuer)
            .setIssuedAt(Math.floor(this.now() / 1000))
            .setExpirationTime(Math.floor(expiresAt / 1000))
            .sign(this.signing.signKey),
        catch: (cause) =>
          new McpOAuthError({
            error: "server_error",
            description: cause instanceof Error ? cause.message : "sign_failed",
          }),
      });

      let refresh_token: string | undefined;
      if (options.includeRefresh) {
        refresh_token = `mcr_${randomBytes(32).toString("base64url")}`;
        yield* this.refreshStore.save(hashRefreshToken(refresh_token), {
          clientId,
          scope,
          expiresAtMs: this.now() + this.refreshTokenTtlSeconds * 1000,
          claims: { ...claims, scope },
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
   */
  validateToken(bearerToken: string): Effect.Effect<AtrClaims, McpOAuthError> {
    return Effect.gen(this, function* () {
      const atr = yield* Effect.tryPromise({
        try: async () => {
          const { payload } = await jwtVerify(bearerToken, this.signing.verifyKey, {
            issuer: this.config.issuer,
            algorithms: [this.signing.algorithm],
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
      return atr;
    });
  }

  /**
   * RFC 7009-style refresh-token revocation. Unknown / already-revoked tokens succeed
   * (no information leak). Access JWTs are short-lived and not denylisted here.
   */
  revokeToken(input: {
    token: string;
    clientId?: string;
    clientSecret?: string;
  }): Effect.Effect<void, McpOAuthError> {
    return Effect.gen(this, function* () {
      const token = input.token?.trim();
      if (!token) return yield* fail("invalid_request", "missing token");

      const hash = hashRefreshToken(token);
      const stored = yield* this.refreshStore.get(hash);
      if (!stored) return;

      const clientId = input.clientId?.trim() || stored.clientId;
      if (stored.clientId !== clientId) return yield* fail("invalid_grant");

      const client = yield* this.clients.getClient(clientId);
      if (client?.clientSecretHash) {
        yield* this.assertClientSecret(client, input.clientSecret);
      }

      yield* this.refreshStore.revoke(hash);
      yield* emitAuthEventEffect(this.eventSink, {
        type: "MCP_TOKEN_REVOKED",
        clientId,
        reason: "client_revoke",
        timestamp: new Date(this.now()).toISOString(),
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

export class McpOAuthService extends Context.Tag(CLAWQL_MCP_OAUTH_SERVICE_TAG)<
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
>() {}

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

export function createMcpOAuthServiceLayer(
  server: MCPOAuthServer
): Layer.Layer<McpOAuthService> {
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

export { ID_JAG_JWT_BEARER_GRANT } from "./id-jag.js";
