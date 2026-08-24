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
  /** HS256 secret (dev / single-node). Prefer asymmetric keys in production. */
  signingSecret: string | Uint8Array;
  eventSink?: AuthEventSink;
  now?: () => number;
  /**
   * Default ClawQL MCP resource audience for ID-JAG assertions when org config
   * does not override `audience`.
   */
  resourceAudience?: string;
  /** Org-level EMA config (IdP JWKS, group→scope mappings). Required for `id_jag`. */
  emaConfigStore?: EmaConfigStore;
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
};

export type McpTokenRequest = {
  grantType: McpGrantTypeInput;
  /** Required for client_credentials / refresh_token; optional for id_jag. */
  clientId?: string;
  clientSecret?: string;
  scope?: string[];
  refreshToken?: string;
  /** ID-JAG identity assertion JWT (EMA / Cross App Access). */
  assertion?: string;
  /** Org id for EMA group→scope lookup (falls back to assertion claim). */
  orgId?: string;
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
  private readonly allowedGrantTypes: Set<McpGrantType>;
  private readonly eventSink: AuthEventSink;
  private readonly now: () => number;
  private readonly key: Uint8Array;
  private readonly emaConfigStore?: EmaConfigStore;

  constructor(
    private readonly config: MCPOAuthConfig,
    private readonly clients: McpClientRegistry,
    private readonly refreshStore: McpRefreshStore
  ) {
    this.tokenTtlSeconds = config.tokenTtlSeconds ?? 300;
    this.refreshTokenTtlSeconds = config.refreshTokenTtlSeconds ?? 3600;
    this.allowedGrantTypes = new Set(
      config.allowedGrantTypes ?? ["client_credentials", "refresh_token", "id_jag"]
    );
    this.eventSink = config.eventSink ?? noopAuthEventSink;
    this.now = config.now ?? Date.now;
    this.key = toKey(config.signingSecret);
    this.emaConfigStore = config.emaConfigStore;
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

    throw new Error("authorization_code grant requires the interactive auth-code path");
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
      audit?: { subjectId?: string; orgId?: string; idpGroups?: string[] };
    }
  ): Promise<McpTokenResponse> {
    const expiresAt = this.now() + this.tokenTtlSeconds * 1000;
    const accessToken = await new SignJWT({
      atr: claims,
      scope: scope.join(" "),
      jti: randomBytes(12).toString("hex"),
    } as JWTPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setIssuedAt(Math.floor(this.now() / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.key);

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
      idpGroups: options.audit?.idpGroups ?? claims.idpGroups,
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
      const { payload } = await jwtVerify(bearerToken, this.key, {
        issuer: this.config.issuer,
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
