/**
 * Express HTTP routes for inbound MCP OAuth 2.1 + EMA admin API.
 */

import type { Express, Request, Response } from "express";

import { ID_JAG_JWT_BEARER_GRANT } from "./id-jag.js";
import type { MCPOAuthServer, McpGrantTypeInput, McpTokenRequest } from "./mcp-oauth.js";
import type { SecretStoreEmaConfigStore } from "./ema-config-store.js";

export const MCP_OAUTH_TOKEN_PATH = "/oauth/token";

export type AttachMcpOAuthRoutesOptions = {
  tokenPath?: string;
  /** When set, enables GET/PUT admin routes for EMA org config. */
  emaAdmin?: {
    store: SecretStoreEmaConfigStore;
    /** Require `Authorization: Bearer` or `x-api-key` matching this value. */
    adminApiKey?: string;
  };
  /** Include minimal OAuth AS discovery at GET /.well-known/oauth-authorization-server */
  wellKnown?: {
    issuer: string;
    resourceAudience?: string;
  };
  /** When set, publishes GET /.well-known/jwks.json and `jwks_uri` in discovery. */
  jwks?: { keys: import("jose").JWK[] };
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
  };
}

function mapIssueTokenError(err: unknown): { status: number; error: string; description: string } {
  const message = err instanceof Error ? err.message : String(err);
  const [code, ...rest] = message.split(":");
  const description = rest.join(":").trim() || message;

  if (code === "unsupported_grant_type") return { status: 400, error: code, description };
  if (code === "invalid_client") return { status: 401, error: code, description };
  if (code === "invalid_grant") return { status: 400, error: code, description };
  if (code === "invalid_scope") return { status: 400, error: code, description };
  if (code === "invalid_request") return { status: 400, error: code, description };
  if (message.includes("authorization_code")) {
    return { status: 501, error: "unsupported_grant_type", description: message };
  }
  return { status: 500, error: "server_error", description: message };
}

export async function handleMcpOAuthTokenRequest(
  server: MCPOAuthServer,
  body: TokenBody,
  res: Response
): Promise<void> {
  let request: McpTokenRequest;
  try {
    request = parseMcpOAuthTokenBody(body);
  } catch (err) {
    const mapped = mapIssueTokenError(err);
    oauthError(res, mapped.status, mapped.error, mapped.description);
    return;
  }

  try {
    const token = await server.issueToken(request);
    res.status(200).json(token);
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

function assertEmaAdmin(req: Request, res: Response, adminApiKey: string | undefined): boolean {
  if (!adminApiKey) {
    oauthError(res, 503, "server_error", "ema_admin_not_configured");
    return false;
  }
  const presented = readAdminCredential(req);
  if (!presented || presented !== adminApiKey) {
    oauthError(res, 401, "invalid_client", "ema_admin_unauthorized");
    return false;
  }
  return true;
}

export function attachMcpOAuthRoutes(
  app: Express,
  server: MCPOAuthServer,
  options: AttachMcpOAuthRoutesOptions = {}
): void {
  const tokenPath = options.tokenPath?.trim() || MCP_OAUTH_TOKEN_PATH;

  app.post(tokenPath, (req, res) => {
    void handleMcpOAuthTokenRequest(server, (req.body ?? {}) as TokenBody, res).catch(
      (err: unknown) => {
        console.error("[clawql-auth] POST oauth/token error:", err);
        if (!res.headersSent) {
          oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
        }
      }
    );
  });

  if (options.wellKnown) {
    const discoveryPath = "/.well-known/oauth-authorization-server";
    app.get(discoveryPath, (req, res) => {
      const proto = req.get("x-forwarded-proto") ?? req.protocol;
      const host = req.get("host") ?? "localhost";
      const origin = `${proto}://${host}`.replace(/\/$/, "");
      const issuer = options.wellKnown!.issuer.replace(/\/$/, "");
      const tokenEndpoint = `${origin}${tokenPath}`;

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.status(200).json({
        issuer,
        token_endpoint: tokenEndpoint,
        grant_types_supported: ["client_credentials", "refresh_token", ID_JAG_JWT_BEARER_GRANT],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        scopes_supported: ["execute", "search", "memory", "mcp:tools"],
        ...(options.jwks?.keys.length
          ? { jwks_uri: `${origin}/.well-known/jwks.json` }
          : {}),
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
    const { store, adminApiKey } = options.emaAdmin;

    app.get("/oauth/ema/orgs", (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      void store
        .listOrgIds()
        .then((orgIds) => res.status(200).json({ orgIds }))
        .catch((err: unknown) => {
          oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
        });
    });

    app.get("/oauth/ema/orgs/:orgId", (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      void store
        .getOrgConfig(req.params.orgId!)
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

    app.put("/oauth/ema/orgs/:orgId", (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      const body = req.body as Record<string, unknown>;
      void store
        .saveOrgConfig({ ...body, orgId: req.params.orgId } as never)
        .then((saved) => res.status(200).json(saved))
        .catch((err: unknown) => {
          oauthError(res, 400, "invalid_request", err instanceof Error ? err.message : String(err));
        });
    });

    app.delete("/oauth/ema/orgs/:orgId", (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      void store
        .deleteOrgConfig(req.params.orgId!)
        .then(() => res.status(204).end())
        .catch((err: unknown) => {
          oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
        });
    });
  }
}

export { ID_JAG_JWT_BEARER_GRANT };
