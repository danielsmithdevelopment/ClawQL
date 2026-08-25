/**
 * Express HTTP routes for inbound MCP OAuth 2.1 + EMA admin API.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";

import type { AtrClaims } from "../gateway.js";
import { ID_JAG_JWT_BEARER_GRANT } from "./id-jag.js";
import {
  McpOAuthError,
  hashMcpClientSecret,
  type MCPOAuthServer,
  type McpGrantType,
  type McpGrantTypeInput,
  type McpRegisteredClient,
  type McpTokenRequest,
} from "./mcp-oauth.js";
import type { SecretStoreEmaConfigStore } from "./ema-config-store.js";
import type { EmaConnectorRegistry } from "./ema-connector-registry.js";
import type { IdJagIssuerService } from "./id-jag-issuer.js";
import type { SecretStoreMcpClientRegistry } from "./mcp-oauth-stores.js";
import { enforceMcpOAuthRateLimit } from "./oauth-rate-limit.js";
import { Effect } from "effect";

export const MCP_OAUTH_TOKEN_PATH = "/oauth/token";
export const MCP_OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const MCP_OAUTH_REVOKE_PATH = "/oauth/revoke";
export const ID_JAG_ISSUER_JWKS_PATH = "/.well-known/id-jag-jwks.json";
export const ID_JAG_ISSUE_PATH = "/oauth/id-jag/issue";
export const MCP_OAUTH_CLIENTS_ADMIN_PATH = "/oauth/ema/clients";

export type McpOAuthAdminAuth = {
  /** Static `CLAWQL_API_KEY` (legacy). */
  adminApiKey?: string;
  /**
   * Resolve ATR claims from the request (issued `cqk_` keys, OIDC, MCP JWT).
   * Must return admin-capable claims (`role === requiredRole` or scope `ema:admin`).
   */
  resolveAdminClaims?: (req: Request) => Effect.Effect<AtrClaims | null>;
  /** Default `admin`. */
  requiredRole?: string;
};

export type AttachMcpOAuthRoutesOptions = {
  tokenPath?: string;
  authorizePath?: string;
  /**
   * Resolve ATR claims for `GET /oauth/authorize`.
   * ClawQL is not a login IdP — the caller must already be authenticated
   * (API key / OIDC / MCP JWT). When set and the AS supports `authorization_code`,
   * the authorize endpoint and discovery metadata are enabled.
   */
  resolveAuthorizeClaims?: (req: Request) => Promise<AtrClaims>;
  /** When set, enables GET/PUT admin routes for EMA org config. */
  emaAdmin?: McpOAuthAdminAuth & {
    store: SecretStoreEmaConfigStore;
  };
  /** When set, enables MCP client registry CRUD under `/oauth/ema/clients`. */
  mcpClientsAdmin?: McpOAuthAdminAuth & {
    registry: SecretStoreMcpClientRegistry;
  };
  /** Include minimal OAuth AS discovery at GET /.well-known/oauth-authorization-server */
  wellKnown?: {
    issuer: string;
    resourceAudience?: string;
  };
  /** When set, publishes GET /.well-known/jwks.json and `jwks_uri` in discovery. */
  jwks?: { keys: import("jose").JWK[] };
  /**
   * Self-hosted ID-JAG issuer (ClawQL as EMA IdP).
   * Publishes JWKS, connector admin routes, and POST /oauth/id-jag/issue.
   */
  idJagIssuer?: McpOAuthAdminAuth & {
    service: IdJagIssuerService["Type"];
    connectors: EmaConnectorRegistry;
    /** Default org when `?orgId=` omitted on JWKS (single-tenant). */
    defaultOrgId?: string;
  };
};

type TokenBody = Record<string, string | undefined>;

function oauthError(res: Response, status: number, error: string, description?: string): void {
  res.status(status).json({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

function parseScope(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function queryParam(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  if (typeof raw === "string") return raw.trim() || undefined;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim() || undefined;
  return undefined;
}

function grantTypesForDiscovery(supported: McpGrantType[]): string[] {
  return supported.map((g) => (g === "id_jag" ? ID_JAG_JWT_BEARER_GRANT : g));
}

/** Parse RFC 6749 `Authorization: Basic` client credentials. */
export function parseHttpBasicClientAuth(authorizationHeader: string | undefined): {
  clientId?: string;
  clientSecret?: string;
} {
  if (!authorizationHeader?.toLowerCase().startsWith("basic ")) return {};
  try {
    const decoded = Buffer.from(authorizationHeader.slice(6).trim(), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return { clientId: decoded.trim() || undefined };
    return {
      clientId: decoded.slice(0, idx).trim() || undefined,
      clientSecret: decoded.slice(idx + 1),
    };
  } catch {
    return {};
  }
}

function mergeClientAuthFromBasic(body: TokenBody, req?: Request): TokenBody {
  const basic = parseHttpBasicClientAuth(req?.get("authorization") ?? undefined);
  return {
    ...body,
    client_id: body.client_id?.trim() || body.clientId?.trim() || basic.clientId,
    client_secret: body.client_secret?.trim() || body.clientSecret?.trim() || basic.clientSecret,
  };
}

export function parseMcpOAuthTokenBody(body: TokenBody): McpTokenRequest {
  const grantType = (body.grant_type?.trim() || body.grantType?.trim()) as
    McpGrantTypeInput | undefined;
  if (!grantType) {
    throw new Error("invalid_request: missing grant_type");
  }

  return {
    grantType,
    clientId: body.client_id?.trim() || body.clientId?.trim(),
    clientSecret: body.client_secret?.trim() || body.clientSecret?.trim(),
    refreshToken: body.refresh_token?.trim() || body.refreshToken?.trim(),
    assertion: body.assertion?.trim(),
    orgId: body.org_id?.trim() || body.orgId?.trim(),
    scope: parseScope(body.scope),
    code: body.code?.trim(),
    codeVerifier: body.code_verifier?.trim() || body.codeVerifier?.trim(),
    redirectUri: body.redirect_uri?.trim() || body.redirectUri?.trim(),
  };
}

function mapIssueTokenError(err: unknown): { status: number; error: string; description: string } {
  if (err instanceof McpOAuthError) {
    const code = err.error;
    const description = err.description?.trim() || err.message;
    if (code === "unsupported_grant_type") return { status: 400, error: code, description };
    if (code === "invalid_client") return { status: 401, error: code, description };
    if (code === "invalid_grant") return { status: 400, error: code, description };
    if (code === "invalid_scope") return { status: 400, error: code, description };
    if (code === "invalid_request") return { status: 400, error: code, description };
    if (code === "invalid_token") return { status: 401, error: code, description };
    return { status: 500, error: "server_error", description };
  }

  const message = err instanceof Error ? err.message : String(err);
  const [code, ...rest] = message.split(":");
  const description = rest.join(":").trim() || message;

  if (code === "unsupported_grant_type") return { status: 400, error: code, description };
  if (code === "invalid_client") return { status: 401, error: code, description };
  if (code === "invalid_grant") return { status: 400, error: code, description };
  if (code === "invalid_scope") return { status: 400, error: code, description };
  if (code === "invalid_request") return { status: 400, error: code, description };
  return { status: 500, error: "server_error", description: message };
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

export async function handleMcpOAuthTokenRequest(
  server: MCPOAuthServer,
  body: TokenBody,
  res: Response,
  req?: Request
): Promise<void> {
  if (req && !enforceMcpOAuthRateLimit(req, res)) return;

  let request: McpTokenRequest;
  try {
    request = parseMcpOAuthTokenBody(mergeClientAuthFromBasic(body, req));
  } catch (err) {
    const mapped = mapIssueTokenError(err);
    oauthError(res, mapped.status, mapped.error, mapped.description);
    return;
  }

  try {
    const token = await Effect.runPromise(server.issueToken(request));
    res.status(200).json(token);
  } catch (err) {
    const mapped = mapIssueTokenError(err);
    oauthError(res, mapped.status, mapped.error, mapped.description);
  }
}

export async function handleMcpOAuthRevokeRequest(
  server: MCPOAuthServer,
  body: TokenBody,
  res: Response,
  req?: Request
): Promise<void> {
  if (req && !enforceMcpOAuthRateLimit(req, res)) return;

  const merged = mergeClientAuthFromBasic(body, req);
  const token = merged.token?.trim() || merged.refresh_token?.trim() || merged.refreshToken?.trim();
  if (!token) {
    oauthError(res, 400, "invalid_request", "missing token");
    return;
  }
  try {
    await Effect.runPromise(
      server.revokeToken({
        token,
        clientId: merged.client_id?.trim() || merged.clientId?.trim(),
        clientSecret: merged.client_secret?.trim() || merged.clientSecret?.trim(),
      })
    );
    res.status(200).json({});
  } catch (err) {
    const mapped = mapIssueTokenError(err);
    oauthError(res, mapped.status, mapped.error, mapped.description);
  }
}

export async function handleMcpOAuthAuthorizeRequest(
  server: MCPOAuthServer,
  req: Request,
  res: Response,
  resolveClaims: (req: Request) => Promise<AtrClaims>
): Promise<void> {
  if (!enforceMcpOAuthRateLimit(req, res)) return;

  let claims: AtrClaims;
  try {
    claims = await resolveClaims(req);
  } catch (err) {
    oauthError(res, 401, "invalid_client", err instanceof Error ? err.message : "unauthorized");
    return;
  }

  const clientId = queryParam(req, "client_id");
  const redirectUri = queryParam(req, "redirect_uri");
  const codeChallenge = queryParam(req, "code_challenge");
  const codeChallengeMethod = queryParam(req, "code_challenge_method") ?? "S256";
  const state = queryParam(req, "state");
  const scope = parseScope(queryParam(req, "scope"));

  if (codeChallengeMethod !== "S256") {
    oauthError(res, 400, "invalid_request", "code_challenge_method_must_be_S256");
    return;
  }

  try {
    const result = await Effect.runPromise(
      server.createAuthorizationCode({
        clientId: clientId ?? "",
        redirectUri: redirectUri ?? "",
        codeChallenge: codeChallenge ?? "",
        codeChallengeMethod: "S256",
        scope,
        state,
        claims,
      })
    );
    res.redirect(302, result.redirectUrl);
  } catch (err) {
    const mapped = mapIssueTokenError(err);
    oauthError(res, mapped.status, mapped.error, mapped.description);
  }
}

function readAdminCredential(req: Request): string | undefined {
  const apiKey = req.get("x-api-key") ?? req.get("x-clawql-api-key");
  if (apiKey?.trim()) return apiKey.trim();
  const auth = req.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return undefined;
}

function claimsAreEmaAdmin(claims: AtrClaims, requiredRole: string): boolean {
  if (claims.role === requiredRole) return true;
  if (claims.scope?.includes("ema:admin") || claims.scope?.includes("*")) return true;
  return false;
}

/**
 * Authorize EMA / MCP-client / ID-JAG admin routes.
 * Accepts static adminApiKey **or** ATR claims from resolveAdminClaims (cqk_ / OIDC / MCP JWT).
 */
export async function assertMcpOAuthAdmin(
  req: Request,
  res: Response,
  auth: McpOAuthAdminAuth | undefined
): Promise<boolean> {
  if (!auth || (!auth.adminApiKey && !auth.resolveAdminClaims)) {
    oauthError(res, 503, "server_error", "ema_admin_not_configured");
    return false;
  }

  const presented = readAdminCredential(req);
  if (auth.adminApiKey && presented && secretsEqual(presented, auth.adminApiKey)) {
    return true;
  }

  if (auth.resolveAdminClaims) {
    try {
      const claims = await Effect.runPromise(auth.resolveAdminClaims(req));
      const requiredRole = auth.requiredRole?.trim() || "admin";
      if (claims && claimsAreEmaAdmin(claims, requiredRole)) return true;
    } catch {
      // fall through to 401
    }
  }

  oauthError(res, 401, "invalid_client", "ema_admin_unauthorized");
  return false;
}

function publicMcpClient(
  client: McpRegisteredClient
): Omit<McpRegisteredClient, "clientSecretHash" | "salt"> & { hasClientSecret: boolean } {
  const { clientSecretHash: _h, salt: _s, ...rest } = client;
  return { ...rest, hasClientSecret: Boolean(client.clientSecretHash) };
}

function parseClientBody(
  clientId: string,
  body: Record<string, unknown>
): McpRegisteredClient | { error: string } {
  const defaultScopeRaw = body.defaultScope ?? body.default_scope;
  const defaultScope = Array.isArray(defaultScopeRaw)
    ? defaultScopeRaw.filter((s): s is string => typeof s === "string")
    : typeof defaultScopeRaw === "string"
      ? defaultScopeRaw.split(/[\s,]+/).filter(Boolean)
      : [];
  if (!defaultScope.length) return { error: "missing defaultScope" };

  const redirectRaw = body.redirectUris ?? body.redirect_uris;
  const redirectUris = Array.isArray(redirectRaw)
    ? redirectRaw.filter((s): s is string => typeof s === "string")
    : undefined;

  const plaintext =
    typeof body.clientSecret === "string"
      ? body.clientSecret
      : typeof body.client_secret === "string"
        ? body.client_secret
        : undefined;
  const salt =
    typeof body.salt === "string" && body.salt.trim()
      ? body.salt.trim()
      : plaintext
        ? randomBytes(8).toString("hex")
        : undefined;
  const clientSecretHash =
    typeof body.clientSecretHash === "string"
      ? body.clientSecretHash
      : plaintext && salt
        ? hashMcpClientSecret(salt, plaintext)
        : undefined;

  return {
    clientId,
    defaultScope,
    defaultRole:
      typeof body.defaultRole === "string"
        ? body.defaultRole
        : typeof body.default_role === "string"
          ? body.default_role
          : undefined,
    orgId:
      typeof body.orgId === "string"
        ? body.orgId
        : typeof body.org_id === "string"
          ? body.org_id
          : undefined,
    teamId:
      typeof body.teamId === "string"
        ? body.teamId
        : typeof body.team_id === "string"
          ? body.team_id
          : undefined,
    redirectUris,
    salt,
    clientSecretHash,
  };
}

export function attachMcpOAuthRoutes(
  app: Express,
  server: MCPOAuthServer | null,
  options: AttachMcpOAuthRoutesOptions = {}
): void {
  const tokenPath = options.tokenPath?.trim() || MCP_OAUTH_TOKEN_PATH;
  const authorizePath = options.authorizePath?.trim() || MCP_OAUTH_AUTHORIZE_PATH;
  const revokePath = MCP_OAUTH_REVOKE_PATH;
  const supportsAuthCode =
    !!server &&
    !!options.resolveAuthorizeClaims &&
    server.getSupportedGrantTypes().includes("authorization_code");

  if (server) {
    app.post(tokenPath, (req, res) => {
      void handleMcpOAuthTokenRequest(server, (req.body ?? {}) as TokenBody, res, req).catch(
        (err: unknown) => {
          console.error("[clawql-auth] POST oauth/token error:", err);
          if (!res.headersSent) {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          }
        }
      );
    });

    app.post(revokePath, (req, res) => {
      void handleMcpOAuthRevokeRequest(server, (req.body ?? {}) as TokenBody, res, req).catch(
        (err: unknown) => {
          console.error("[clawql-auth] POST oauth/revoke error:", err);
          if (!res.headersSent) {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          }
        }
      );
    });

    if (supportsAuthCode && options.resolveAuthorizeClaims) {
      const resolveClaims = options.resolveAuthorizeClaims;
      app.get(authorizePath, (req, res) => {
        void handleMcpOAuthAuthorizeRequest(server, req, res, resolveClaims).catch(
          (err: unknown) => {
            console.error("[clawql-auth] GET oauth/authorize error:", err);
            if (!res.headersSent) {
              oauthError(
                res,
                500,
                "server_error",
                err instanceof Error ? err.message : String(err)
              );
            }
          }
        );
      });
    }
  }

  if (options.wellKnown && server) {
    const discoveryPath = "/.well-known/oauth-authorization-server";
    app.get(discoveryPath, (req, res) => {
      const proto = req.get("x-forwarded-proto") ?? req.protocol;
      const host = req.get("host") ?? "localhost";
      const origin = `${proto}://${host}`.replace(/\/$/, "");
      const issuer = options.wellKnown!.issuer.replace(/\/$/, "");
      const tokenEndpoint = `${origin}${tokenPath}`;
      const supported = server.getSupportedGrantTypes();
      const authCodeEnabled = supportsAuthCode && supported.includes("authorization_code");

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.status(200).json({
        issuer,
        token_endpoint: tokenEndpoint,
        revocation_endpoint: `${origin}${revokePath}`,
        ...(authCodeEnabled
          ? {
              authorization_endpoint: `${origin}${authorizePath}`,
              code_challenge_methods_supported: ["S256"],
            }
          : {}),
        grant_types_supported: grantTypesForDiscovery(supported),
        token_endpoint_auth_methods_supported: [
          "client_secret_post",
          "client_secret_basic",
          "none",
        ],
        scopes_supported: ["execute", "search", "memory", "mcp:tools"],
        ...(options.jwks?.keys.length ? { jwks_uri: `${origin}/.well-known/jwks.json` } : {}),
        agent_auth: {
          identity_assertion: {
            assertion_types_supported: ["urn:ietf:params:oauth:token-type:id-jag"],
          },
        },
        ...(options.wellKnown!.resourceAudience
          ? { resource_audience: options.wellKnown!.resourceAudience }
          : {}),
      });
    });
  }

  if (options.jwks?.keys.length) {
    app.get("/.well-known/jwks.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.status(200).json(options.jwks);
    });
  }

  if (options.emaAdmin) {
    const admin = options.emaAdmin;
    const { store } = admin;

    app.get("/oauth/ema/orgs", (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(store.listOrgIds())
          .then((orgIds) => res.status(200).json({ orgIds }))
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });

    app.get("/oauth/ema/orgs/:orgId", (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(store.getOrgConfig(req.params.orgId!))
          .then((config) => {
            if (!config) {
              oauthError(res, 404, "invalid_request", "unknown_org");
              return;
            }
            res.status(200).json(config);
          })
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });

    app.put("/oauth/ema/orgs/:orgId", (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        const body = req.body as Record<string, unknown>;
        void Effect.runPromise(store.saveOrgConfig({ ...body, orgId: req.params.orgId } as never))
          .then((saved) => res.status(200).json(saved))
          .catch((err: unknown) => {
            oauthError(
              res,
              400,
              "invalid_request",
              err instanceof Error ? err.message : String(err)
            );
          });
      });
    });

    app.delete("/oauth/ema/orgs/:orgId", (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(store.deleteOrgConfig(req.params.orgId!))
          .then(() => res.status(204).end())
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });
  }

  if (options.mcpClientsAdmin) {
    const admin = options.mcpClientsAdmin;
    const { registry } = admin;
    const base = MCP_OAUTH_CLIENTS_ADMIN_PATH;

    app.get(base, (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(
          Effect.gen(function* () {
            const ids = yield* registry.listClientIds();
            const clients = [];
            for (const id of ids) {
              const c = yield* registry.getClient(id);
              if (c) clients.push(publicMcpClient(c));
            }
            return clients;
          })
        )
          .then((clients) => res.status(200).json({ clients }))
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });

    app.get(`${base}/:clientId`, (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(registry.getClient(req.params.clientId!))
          .then((client) => {
            if (!client) {
              oauthError(res, 404, "invalid_request", "unknown_client");
              return;
            }
            res.status(200).json(publicMcpClient(client));
          })
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });

    app.put(`${base}/:clientId`, (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        const parsed = parseClientBody(
          req.params.clientId!,
          (req.body ?? {}) as Record<string, unknown>
        );
        if ("error" in parsed) {
          oauthError(res, 400, "invalid_request", parsed.error);
          return;
        }
        void Effect.runPromise(registry.saveClient(parsed))
          .then(() => res.status(200).json(publicMcpClient(parsed)))
          .catch((err: unknown) => {
            oauthError(
              res,
              400,
              "invalid_request",
              err instanceof Error ? err.message : String(err)
            );
          });
      });
    });

    app.delete(`${base}/:clientId`, (req, res) => {
      void assertMcpOAuthAdmin(req, res, admin).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(registry.deleteClient(req.params.clientId!))
          .then(() => res.status(204).end())
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });
  }

  if (options.idJagIssuer) {
    const issuer = options.idJagIssuer;
    const { service, connectors, defaultOrgId } = issuer;

    app.get(ID_JAG_ISSUER_JWKS_PATH, (req, res) => {
      const orgId =
        (typeof req.query.orgId === "string" && req.query.orgId.trim()) ||
        (typeof req.query.org === "string" && req.query.org.trim()) ||
        defaultOrgId;
      if (!orgId) {
        oauthError(res, 400, "invalid_request", "missing_org_id");
        return;
      }
      void Effect.runPromise(service.jwks(orgId))
        .then((jwks) => {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=300");
          res.status(200).json(jwks);
        })
        .catch((err: unknown) => {
          const reason =
            err && typeof err === "object" && "reason" in err
              ? String((err as { reason: string }).reason)
              : err instanceof Error
                ? err.message
                : String(err);
          oauthError(res, 404, "invalid_request", reason);
        });
    });

    app.get("/oauth/ema/connectors/:orgId", (req, res) => {
      void assertMcpOAuthAdmin(req, res, issuer).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(connectors.list(req.params.orgId!))
          .then((list) => res.status(200).json({ connectors: list }))
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });

    app.put("/oauth/ema/connectors/:orgId/:connectorId", (req, res) => {
      void assertMcpOAuthAdmin(req, res, issuer).then((ok) => {
        if (!ok) return;
        const body = (req.body ?? {}) as Record<string, unknown>;
        void Effect.runPromise(
          connectors.save({
            ...body,
            orgId: req.params.orgId!,
            connectorId: req.params.connectorId!,
            audience: (body.audience as string | string[]) ?? "",
            enabled: body.enabled !== false,
            createdAt:
              typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
          })
        )
          .then((saved) => res.status(200).json(saved))
          .catch((err: unknown) => {
            oauthError(
              res,
              400,
              "invalid_request",
              err instanceof Error ? err.message : String(err)
            );
          });
      });
    });

    app.delete("/oauth/ema/connectors/:orgId/:connectorId", (req, res) => {
      void assertMcpOAuthAdmin(req, res, issuer).then((ok) => {
        if (!ok) return;
        void Effect.runPromise(connectors.delete(req.params.orgId!, req.params.connectorId!))
          .then(() => res.status(204).end())
          .catch((err: unknown) => {
            oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
          });
      });
    });

    app.post(ID_JAG_ISSUE_PATH, (req, res) => {
      if (!enforceMcpOAuthRateLimit(req, res)) return;
      void assertMcpOAuthAdmin(req, res, issuer).then((ok) => {
        if (!ok) return;
        const body = (req.body ?? {}) as Record<string, unknown>;
        const groupsRaw = body.groups;
        const groups = Array.isArray(groupsRaw)
          ? groupsRaw.filter((g): g is string => typeof g === "string")
          : typeof groupsRaw === "string"
            ? groupsRaw.split(/[\s,]+/).filter(Boolean)
            : [];
        void Effect.runPromise(
          service.issueAssertion({
            orgId: String(body.orgId ?? body.org_id ?? ""),
            subjectId: String(body.subjectId ?? body.subject_id ?? body.sub ?? ""),
            connectorId: String(body.connectorId ?? body.connector_id ?? ""),
            groups,
            email: typeof body.email === "string" ? body.email : undefined,
            emailVerified:
              typeof body.emailVerified === "boolean"
                ? body.emailVerified
                : typeof body.email_verified === "boolean"
                  ? body.email_verified
                  : undefined,
            ttlSeconds:
              typeof body.ttlSeconds === "number"
                ? body.ttlSeconds
                : typeof body.ttl_seconds === "number"
                  ? body.ttl_seconds
                  : undefined,
          })
        )
          .then((issued) => res.status(200).json(issued))
          .catch((err: unknown) => {
            const reason =
              err && typeof err === "object" && "reason" in err
                ? String((err as { reason: string }).reason)
                : err instanceof Error
                  ? err.message
                  : String(err);
            oauthError(res, 400, "invalid_request", reason);
          });
      });
    });
  }
}

export { ID_JAG_JWT_BEARER_GRANT };
