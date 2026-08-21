/**
 * Inbound MCP OAuth 2.1 authorization server (gateway-facing).
 * Issues short-lived access JWTs with ATR claims for MCP clients (Cursor, Cline, Claude Desktop).
 *
 * ClawQL is still not a full human IdP — this issues tokens for *MCP clients* registered
 * against this gateway, not end-user login/password accounts.
 */

import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { emitAuthEvent, noopAuthEventSink, type AuthEventSink } from "../audit/auth-events.js";
import type { AtrClaims } from "../gateway.js";

export type McpGrantType = "authorization_code" | "client_credentials" | "refresh_token";

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
  grantType: McpGrantType;
  clientId: string;
  clientSecret?: string;
  scope?: string[];
  refreshToken?: string;
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

export class MCPOAuthServer {
  private readonly tokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly allowedGrantTypes: Set<McpGrantType>;
  private readonly eventSink: AuthEventSink;
  private readonly now: () => number;
  private readonly key: Uint8Array;

  constructor(
    private readonly config: MCPOAuthConfig,
    private readonly clients: McpClientRegistry,
    private readonly refreshStore: McpRefreshStore
  ) {
    this.tokenTtlSeconds = config.tokenTtlSeconds ?? 300;
    this.refreshTokenTtlSeconds = config.refreshTokenTtlSeconds ?? 3600;
    this.allowedGrantTypes = new Set(
      config.allowedGrantTypes ?? ["client_credentials", "refresh_token"]
    );
    this.eventSink = config.eventSink ?? noopAuthEventSink;
    this.now = config.now ?? Date.now;
    this.key = toKey(config.signingSecret);
  }

  async issueToken(request: McpTokenRequest): Promise<McpTokenResponse> {
    if (!this.allowedGrantTypes.has(request.grantType)) {
      throw new Error(`unsupported_grant_type: ${request.grantType}`);
    }

    if (request.grantType === "refresh_token") {
      return this.refreshAccessToken(request);
    }

    if (request.grantType === "client_credentials") {
      return this.issueClientCredentials(request);
    }

    throw new Error("authorization_code grant requires the interactive auth-code path");
  }

  private async issueClientCredentials(request: McpTokenRequest): Promise<McpTokenResponse> {
    const client = await this.clients.getClient(request.clientId);
    if (!client) throw new Error("invalid_client");
    if (client.clientSecretHash) {
      if (!request.clientSecret || !client.salt) throw new Error("invalid_client");
      const hash = hashSecret(client.salt, request.clientSecret);
      if (hash !== client.clientSecretHash) throw new Error("invalid_client");
    }

    const scope = request.scope?.length ? request.scope : client.defaultScope;
    const claims = this.buildAtrClaims(client, scope);
    return this.mintTokens(client.clientId, claims, scope, true);
  }

  private async refreshAccessToken(request: McpTokenRequest): Promise<McpTokenResponse> {
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

    // Rotate refresh token
    await this.refreshStore.revoke(hash);

    const scope = request.scope?.length ? request.scope : stored.scope;
    const claims = this.buildAtrClaims(client, scope);
    const response = await this.mintTokens(client.clientId, claims, scope, true);

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
    includeRefresh: boolean
  ): Promise<McpTokenResponse> {
    const expiresAt = this.now() + this.tokenTtlSeconds * 1000;
    const accessToken = await new SignJWT({
      atr: claims,
      scope: scope.join(" "),
      jti: randomBytes(12).toString("hex"),
    } as JWTPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(clientId)
      .setIssuer(this.config.issuer)
      .setIssuedAt(Math.floor(this.now() / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.key);

    let refresh_token: string | undefined;
    if (includeRefresh) {
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
      grantType: includeRefresh ? "client_credentials_or_refresh" : "client_credentials",
      scope,
      expiresAt: new Date(expiresAt).toISOString(),
      timestamp: new Date(this.now()).toISOString(),
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
