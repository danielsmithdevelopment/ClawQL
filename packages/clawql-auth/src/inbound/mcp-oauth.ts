/**
 * Inbound MCP OAuth 2.1 authorization server (gateway-facing).
 * Issues short-lived access JWTs with ATR claims for MCP clients (Cursor, Cline, Claude Desktop).
 *
 * Supports Enterprise-Managed Authorization (EMA) via ID-JAG / Cross App Access —
 * org admins authorize the connector once at the IdP; users inherit access on first login.
 *
 * ClawQL is still not a full human IdP — this issues tokens for *MCP clients* registered
 * against this gateway, not end-user login/password accounts.
 */

import { createHash, randomBytes } from "node:crypto";
import { Effect } from "effect";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { emitAuthEvent, noopAuthEventSink, type AuthEventSink } from "../audit/auth-events.js";
import type { AtrClaims } from "../gateway.js";
import { generateCodeChallenge } from "../oauth/auth-code.js";
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
  getClient: (clientId: string) => Promise<McpRegisteredClient | null>;
};

export type McpRefreshStore = {
  save: (
    refreshTokenHash: string,
    record: { clientId: string; scope: string[]; expiresAtMs: number }
  ) => Promise<void>;
  get: (
    refreshTokenHash: string
  ) => Promise<{ clientId: string; scope: string[]; expiresAtMs: number } | null>;
  revoke: (refreshTokenHash: string) => Promise<void>;
};

function hashSecret(salt: string, value: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

  async issueToken(request: McpTokenRequest): Promise<McpTokenResponse> {
    const grantType = normalizeGrantType(request.grantType);
    if (!this.allowedGrantTypes.has(grantType)) {
      throw new Error(`unsupported_grant_type: ${request.grantType}`);
    }

    if (grantType === "refresh_token") {
      return this.refreshAccessToken(request);
    }

    if (grantType === "client_credentials") {
      return this.issueClientCredentials(request);
    }

    if (grantType === "id_jag") {
      return this.exchangeIdJag(request);
    }

    if (grantType === "authorization_code") {
      return this.exchangeAuthorizationCode(request);
    }

    throw new Error("unsupported_grant_type");
  }

  /**
   * Start interactive `authorization_code` (PKCE S256).
   * ClawQL is not a login IdP — caller must already supply ATR claims from API key / OIDC / MCP JWT.
   */
  async createAuthorizationCode(request: McpAuthorizeRequest): Promise<McpAuthorizeResult> {
    if (!this.authCodeStore) {
      throw new Error("invalid_request: authorization_code_not_configured");
    }
    if (!this.allowedGrantTypes.has("authorization_code")) {
      throw new Error("unsupported_grant_type: authorization_code");
    }

    const clientId = request.clientId?.trim();
    const redirectUri = request.redirectUri?.trim();
    const codeChallenge = request.codeChallenge?.trim();
    if (!clientId) throw new Error("invalid_request: missing client_id");
    if (!redirectUri) throw new Error("invalid_request: missing redirect_uri");
    if (!codeChallenge) throw new Error("invalid_request: missing code_challenge");
    if (request.codeChallengeMethod && request.codeChallengeMethod !== "S256") {
      throw new Error("invalid_request: code_challenge_method_must_be_S256");
    }
    if (!request.claims?.sub) throw new Error("invalid_request: missing_subject_claims");

    const client = await this.clients.getClient(clientId);
    if (!client) throw new Error("invalid_client");
    const allowed = client.redirectUris ?? [];
    if (allowed.length === 0 || !allowed.includes(redirectUri)) {
      throw new Error("invalid_request: redirect_uri_not_registered");
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
    if (scope.length === 0) throw new Error("invalid_scope");

    const code = `mca_${randomBytes(24).toString("base64url")}`;
    const codeHash = hashRefreshToken(code);
    const nowMs = this.now();
    await this.authCodeStore.save(codeHash, {
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
  }

  private async exchangeAuthorizationCode(request: McpTokenRequest): Promise<McpTokenResponse> {
    if (!this.authCodeStore) {
      throw new Error("invalid_request: authorization_code_not_configured");
    }
    if (!request.clientId?.trim()) throw new Error("invalid_client");
    if (!request.code?.trim()) throw new Error("invalid_request: missing code");
    if (!request.codeVerifier?.trim()) throw new Error("invalid_request: missing code_verifier");
    if (!request.redirectUri?.trim()) throw new Error("invalid_request: missing redirect_uri");

    const client = await this.clients.getClient(request.clientId.trim());
    if (!client) throw new Error("invalid_client");
    if (client.clientSecretHash) {
      if (!request.clientSecret || !client.salt) throw new Error("invalid_client");
      const hash = hashSecret(client.salt, request.clientSecret);
      if (hash !== client.clientSecretHash) throw new Error("invalid_client");
    }

    const codeHash = hashRefreshToken(request.code.trim());
    const stored = await this.authCodeStore.consume(codeHash);
    if (!stored || stored.expiresAtMs <= this.now()) {
      throw new Error("invalid_grant: code_expired_or_missing");
    }
    if (stored.clientId !== request.clientId.trim()) {
      throw new Error("invalid_grant: client_mismatch");
    }
    if (stored.redirectUri !== request.redirectUri.trim()) {
      throw new Error("invalid_grant: redirect_uri_mismatch");
    }

    const challenge = generateCodeChallenge(request.codeVerifier.trim());
    if (challenge !== stored.codeChallenge) {
      throw new Error("invalid_grant: pkce_failed");
    }

    const scope = request.scope?.length
      ? intersectScopes(stored.scope, request.scope)
      : stored.scope;
    if (scope.length === 0) throw new Error("invalid_scope");

    const claims: AtrClaims = { ...stored.claims, scope };
    return this.mintTokens(request.clientId.trim(), claims, scope, {
      grantType: "authorization_code",
      includeRefresh: true,
      audit: {
        subjectId: claims.sub,
        orgId: claims.orgId,
        role: claims.role,
      },
    });
  }

  /**
   * Exchange an IdP-issued ID-JAG assertion for a ClawQL MCP access token.
   * Zero per-user consent — scope derives from admin-configured IdP group mappings.
   */
  async exchangeIdJag(request: McpTokenRequest): Promise<McpTokenResponse> {
    if (!request.assertion?.trim()) {
      throw new Error("invalid_request: missing assertion");
    }
    if (!this.emaConfigStore) {
      throw new Error("invalid_request: ema_not_configured");
    }

    const assertion = request.assertion.trim();
    const orgHint = request.orgId?.trim();

    let orgId = orgHint;
    if (!orgId) {
      const peek = await this.peekAssertionOrgId(assertion);
      orgId = peek ?? undefined;
    }
    if (!orgId) {
      throw new Error("invalid_request: missing org_id");
    }

    const emaConfig = await this.emaConfigStore.getOrgConfig(orgId);
    if (!emaConfig) {
      throw new Error("invalid_request: unknown_org");
    }

    const audience = emaConfig.audience ?? this.config.resourceAudience;
    if (!audience) {
      throw new Error("invalid_request: ema_audience_not_configured");
    }

    const verified = await Effect.runPromise(
      verifyIdJagAssertionEffect(assertion, {
        ...emaConfig,
        audience,
      }).pipe(
        Effect.catchAll((err: IdJagAuthError) =>
          Effect.sync(() => {
            throw new Error(`invalid_grant: ${err.reason}`);
          })
        )
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
        throw new Error(`invalid_grant: ${cause.reason}`);
      }
      throw cause;
    }

    const claims = atrClaimsFromIdJag(verified, resolved);
    const scope = request.scope?.length
      ? intersectScopes(resolved.scope, request.scope)
      : resolved.scope;

    if (scope.length === 0) {
      throw new Error("invalid_scope");
    }

    const finalClaims: AtrClaims = { ...claims, scope };
    const clientId = request.clientId?.trim() || verified.sub;

    return this.mintTokens(clientId, finalClaims, scope, {
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
  }

  private async peekAssertionOrgId(assertion: string): Promise<string | null> {
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
  }

  private async issueClientCredentials(request: McpTokenRequest): Promise<McpTokenResponse> {
    if (!request.clientId) throw new Error("invalid_client");
    const client = await this.clients.getClient(request.clientId);
    if (!client) throw new Error("invalid_client");
    if (client.clientSecretHash) {
      if (!request.clientSecret || !client.salt) throw new Error("invalid_client");
      const hash = hashSecret(client.salt, request.clientSecret);
      if (hash !== client.clientSecretHash) throw new Error("invalid_client");
    }

    const scope = request.scope?.length ? request.scope : client.defaultScope;
    const claims = this.buildAtrClaims(client, scope);
    return this.mintTokens(client.clientId, claims, scope, {
      grantType: "client_credentials",
      includeRefresh: true,
    });
  }

  private async refreshAccessToken(request: McpTokenRequest): Promise<McpTokenResponse> {
    if (!request.clientId) throw new Error("invalid_client");
    if (!request.refreshToken) throw new Error("invalid_request");
    const hash = hashRefreshToken(request.refreshToken);
    const stored = await this.refreshStore.get(hash);
    if (!stored || stored.expiresAtMs <= this.now()) {
      await emitAuthEvent(this.eventSink, {
        type: "MCP_TOKEN_VALIDATION_FAILED",
        reason: "refresh_expired_or_missing",
        timestamp: new Date(this.now()).toISOString(),
      });
      throw new Error("invalid_grant");
    }
    if (stored.clientId !== request.clientId) throw new Error("invalid_grant");

    const client = await this.clients.getClient(request.clientId);
    if (!client) throw new Error("invalid_client");

    await this.refreshStore.revoke(hash);

    const scope = request.scope?.length ? request.scope : stored.scope;
    const claims = this.buildAtrClaims(client, scope);
    const response = await this.mintTokens(client.clientId, claims, scope, {
      grantType: "refresh_token",
      includeRefresh: true,
    });

    await emitAuthEvent(this.eventSink, {
      type: "MCP_TOKEN_REFRESHED",
      clientId: client.clientId,
      expiresAt: new Date(this.now() + this.tokenTtlSeconds * 1000).toISOString(),
      timestamp: new Date(this.now()).toISOString(),
    });

    return response;
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

  private async mintTokens(
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
  ): Promise<McpTokenResponse> {
    const expiresAt = this.now() + this.tokenTtlSeconds * 1000;
    const accessToken = await new SignJWT({
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
      .sign(this.signing.signKey);

    let refresh_token: string | undefined;
    if (options.includeRefresh) {
      refresh_token = `mcr_${randomBytes(32).toString("base64url")}`;
      await this.refreshStore.save(hashRefreshToken(refresh_token), {
        clientId,
        scope,
        expiresAtMs: this.now() + this.refreshTokenTtlSeconds * 1000,
      });
    }

    await emitAuthEvent(this.eventSink, {
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
      token_type: "Bearer",
      expires_in: this.tokenTtlSeconds,
      refresh_token,
      scope: scope.join(" "),
    };
  }

  /**
   * Validate Bearer access token; returns ATR claims for Panguard / gateway.
   */
  async validateToken(bearerToken: string): Promise<AtrClaims> {
    try {
      const { payload } = await jwtVerify(bearerToken, this.signing.verifyKey, {
        issuer: this.config.issuer,
        algorithms: [this.signing.algorithm],
      });
      const atr = payload.atr as AtrClaims | undefined;
      if (!atr || typeof atr !== "object" || !atr.sub) {
        throw new Error("missing atr claim");
      }
      return atr;
    } catch (cause) {
      await emitAuthEvent(this.eventSink, {
        type: "MCP_TOKEN_VALIDATION_FAILED",
        reason: cause instanceof Error ? cause.message : "verify_failed",
        timestamp: new Date(this.now()).toISOString(),
      });
      throw cause;
    }
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

export function hashMcpClientSecret(salt: string, secret: string): string {
  return hashSecret(salt, secret);
}

export function createMemoryMcpClientRegistry(
  clients: McpRegisteredClient[]
): McpClientRegistry & { readonly list: McpRegisteredClient[] } {
  const map = new Map(clients.map((c) => [c.clientId, c]));
  return {
    list: clients,
    async getClient(clientId) {
      return map.get(clientId) ?? null;
    },
  };
}

export function createMemoryMcpRefreshStore(): McpRefreshStore & {
  readonly map: Map<string, { clientId: string; scope: string[]; expiresAtMs: number }>;
} {
  const map = new Map<string, { clientId: string; scope: string[]; expiresAtMs: number }>();
  return {
    map,
    async save(hash, record) {
      map.set(hash, record);
    },
    async get(hash) {
      return map.get(hash) ?? null;
    },
    async revoke(hash) {
      map.delete(hash);
    },
  };
}

export { ID_JAG_JWT_BEARER_GRANT } from "./id-jag.js";
