/**
 * Express HTTP routes for inbound MCP OAuth 2.1 + EMA admin API.
 */

import type { Express, Request, Response } from "express";

import type { AtrClaims } from "../gateway.js";
import { ID_JAG_JWT_BEARER_GRANT } from "./id-jag.js";
import type {
  MCPOAuthServer,
  McpGrantType,
  McpGrantTypeInput,
  McpTokenRequest,
} from "./mcp-oauth.js";
import type { SecretStoreEmaConfigStore } from "./ema-config-store.js";
import type { EmaConnectorRegistry } from "./ema-connector-registry.js";
import type { IdJagIssuerService } from "./id-jag-issuer.js";
import { Effect } from "effect";

export const MCP_OAUTH_TOKEN_PATH = "/oauth/token";
export const MCP_OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const ID_JAG_ISSUER_JWKS_PATH = "/.well-known/id-jag-jwks.json";
export const ID_JAG_ISSUE_PATH = "/oauth/id-jag/issue";

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
  /**
   * Self-hosted ID-JAG issuer (ClawQL as EMA IdP).
   * Publishes JWKS, connector admin routes, and POST /oauth/id-jag/issue.
   */
  idJagIssuer?: {
    service: IdJagIssuerService["Type"];
    connectors: EmaConnectorRegistry;
    /** Default org when `?orgId=` omitted on JWKS (single-tenant). */
    defaultOrgId?: string;
    adminApiKey?: string;
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

export function parseMcpOAuthTokenBody(body: TokenBody): McpTokenRequest {
  const grantType = (body.grant_type?.trim() || body.grantType?.trim()) as
    | McpGrantTypeInput
    | undefined;
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

export async function handleMcpOAuthAuthorizeRequest(
  server: MCPOAuthServer,
  req: Request,
  res: Response,
  resolveClaims: (req: Request) => Promise<AtrClaims>
): Promise<void> {
  let claims: AtrClaims;
  try {
    claims = await resolveClaims(req);
  } catch (err) {
    oauthError(
      res,
      401,
      "invalid_client",
      err instanceof Error ? err.message : "unauthorized"
    );
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
    const result = await server.createAuthorizationCode({
      clientId: clientId ?? "",
      redirectUri: redirectUri ?? "",
      codeChallenge: codeChallenge ?? "",
      codeChallengeMethod: "S256",
      scope,
      state,
      claims,
    });
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
  server: MCPOAuthServer | null,
  options: AttachMcpOAuthRoutesOptions = {}
): void {
  const tokenPath = options.tokenPath?.trim() || MCP_OAUTH_TOKEN_PATH;
  const authorizePath = options.authorizePath?.trim() || MCP_OAUTH_AUTHORIZE_PATH;
  const supportsAuthCode =
    !!server &&
    !!options.resolveAuthorizeClaims &&
    server.getSupportedGrantTypes().includes("authorization_code");

  if (server) {
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
      const authCodeEnabled =
        supportsAuthCode && supported.includes("authorization_code");

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.status(200).json({
        issuer,
        token_endpoint: tokenEndpoint,
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

  if (options.idJagIssuer) {
    const { service, connectors, defaultOrgId, adminApiKey } = options.idJagIssuer;

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
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      void connectors
        .list(req.params.orgId!)
        .then((list) => res.status(200).json({ connectors: list }))
        .catch((err: unknown) => {
          oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
        });
    });

    app.put("/oauth/ema/connectors/:orgId/:connectorId", (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      void connectors
        .save({
          ...body,
          orgId: req.params.orgId!,
          connectorId: req.params.connectorId!,
          audience: (body.audience as string | string[]) ?? "",
          enabled: body.enabled !== false,
          createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
        })
        .then((saved) => res.status(200).json(saved))
        .catch((err: unknown) => {
          oauthError(res, 400, "invalid_request", err instanceof Error ? err.message : String(err));
        });
    });

    app.delete("/oauth/ema/connectors/:orgId/:connectorId", (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
      void connectors
        .delete(req.params.orgId!, req.params.connectorId!)
        .then(() => res.status(204).end())
        .catch((err: unknown) => {
          oauthError(res, 500, "server_error", err instanceof Error ? err.message : String(err));
        });
    });

    app.post(ID_JAG_ISSUE_PATH, (req, res) => {
      if (!assertEmaAdmin(req, res, adminApiKey)) return;
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
  }
}

export { ID_JAG_JWT_BEARER_GRANT };
