/**
 * Console / operator HTTP: outbound payment approve (audit Y1–Y3).
 *
 * Auth is intentionally separate from /mcp:
 * - Dedicated CLAWQL_OPERATOR_APPROVE_KEY (header X-ClawQL-Operator-Key or Bearer), or
 * - OIDC JWT with role operator|admin (no virtual keys, no MCP OAuth, no noAuth).
 * Tenant always comes from verified claims / operator-key env — never the body.
 */

import { timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { join } from "node:path";
import { Effect } from "effect";
import {
  getOutboundPendingQuoteEffect,
  recordOutboundOperatorApprovalEffect,
} from "./operator-approval.js";

export type AttachOutboundApproveRoutesOptions = {
  basePath?: string;
  env?: NodeJS.ProcessEnv;
};

function resolveHome(env: NodeJS.ProcessEnv): string {
  return env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
}

function headerValue(headers: Request["headers"], name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === "string" ? v.trim() : undefined;
}

function keysEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function extractPresentedOperatorKey(req: Request): string | undefined {
  const dedicated = headerValue(req.headers, "x-clawql-operator-key");
  if (dedicated) return dedicated;
  const bearer = headerValue(req.headers, "authorization");
  if (!bearer) return undefined;
  const m = /^Bearer\s+(\S+)/i.exec(bearer);
  return m?.[1];
}

export type OperatorApproveIdentity = {
  principal: string;
  tenantId: string;
};

/**
 * Resolve a human operator identity for outbound approve (audit Y1/Y2).
 * Exported for unit tests.
 */
export async function resolveOutboundApproveOperator(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): Promise<
  { ok: true; identity: OperatorApproveIdentity } | { ok: false; status: number; error: string }
> {
  const operatorKey = env.CLAWQL_OPERATOR_APPROVE_KEY?.trim();
  const presented = extractPresentedOperatorKey(req);

  // Path A — dedicated operator key (separate from CLAWQL_API_KEY / virtual keys).
  if (operatorKey && presented && keysEqual(presented, operatorKey)) {
    const principal =
      env.CLAWQL_OPERATOR_ID?.trim() ||
      headerValue(req.headers, "x-clawql-operator-id") ||
      "operator-key";
    const tenantId = env.CLAWQL_TENANT_ID?.trim() || "default";
    return {
      ok: true,
      identity: { principal: `operator:${principal}`, tenantId },
    };
  }

  const authMode = (env.CLAWQL_AUTH_MODE?.trim().toLowerCase() || "noAuth").replace(/[_-]/g, "");
  if (authMode === "noauth" || authMode === "") {
    return {
      ok: false,
      status: 401,
      error:
        "outbound approve refuses noAuth — set CLAWQL_OPERATOR_APPROVE_KEY or CLAWQL_AUTH_MODE=oidc (audit Y1)",
    };
  }
  if (authMode === "mcpoauth" || authMode === "mcp oauth") {
    return {
      ok: false,
      status: 401,
      error:
        "outbound approve refuses MCP OAuth tokens — use operator key or human OIDC (audit Y1)",
    };
  }
  if (authMode === "apikey") {
    // Static MCP API keys / virtual keys must not approve (Y1).
    return {
      ok: false,
      status: 401,
      error:
        "outbound approve refuses MCP API keys — set CLAWQL_OPERATOR_APPROVE_KEY (dedicated) or CLAWQL_AUTH_MODE=oidc (audit Y1)",
    };
  }

  // Path B — OIDC human JWT with operator|admin role.
  if (authMode === "oidc" || authMode === "oauth2") {
    try {
      const { loadGatewayAuthConfig, resolveAtrClaimsFromHeadersEffect } =
        await import("clawql-auth");
      const config = await Effect.runPromise(loadGatewayAuthConfig(env));
      // Force oidc path even if mcpOAuthValidator is also wired on the host.
      const oidcOnly = { ...config, mode: "oidc" as const, mcpOAuthValidator: undefined };
      const claims = await Effect.runPromise(
        resolveAtrClaimsFromHeadersEffect(req.headers, oidcOnly)
      );
      if (claims.virtualKeyId) {
        return {
          ok: false,
          status: 403,
          error: "outbound approve refuses virtual keys (audit Y1)",
        };
      }
      const role = (claims.role ?? "").toLowerCase();
      const scopes = claims.scope ?? [];
      const roleOk =
        role === "operator" ||
        role === "admin" ||
        scopes.includes("payments:approve") ||
        scopes.includes("*");
      if (!roleOk) {
        return {
          ok: false,
          status: 403,
          error: "outbound approve requires role operator|admin (or scope payments:approve)",
        };
      }
      const sub = claims.sub?.trim();
      if (!sub) {
        return { ok: false, status: 401, error: "OIDC claims.sub required" };
      }
      const tenantId = claims.tenantId?.trim() || "default";
      return {
        ok: true,
        identity: { principal: `operator:${sub}`, tenantId },
      };
    } catch (e: unknown) {
      return {
        ok: false,
        status: 401,
        error: e instanceof Error ? e.message : "OIDC authentication failed",
      };
    }
  }

  return {
    ok: false,
    status: 401,
    error:
      "outbound approve requires CLAWQL_OPERATOR_APPROVE_KEY or CLAWQL_AUTH_MODE=oidc (audit Y1)",
  };
}

export function attachOutboundApproveRoutes(
  app: Express,
  options: AttachOutboundApproveRoutesOptions = {}
): void {
  const env = options.env ?? process.env;
  const base = (options.basePath ?? "/payments/outbound").replace(/\/$/, "");

  const requireOperator = (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const result = await resolveOutboundApproveOperator(req, env);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      (req as Request & { clawqlOperatorApprove?: OperatorApproveIdentity }).clawqlOperatorApprove =
        result.identity;
      next();
    })();
  };

  // Y3: show parked quote before approve.
  app.get(`${base}/quote/:quoteDigest`, requireOperator, (req, res) => {
    void (async () => {
      const identity = (req as Request & { clawqlOperatorApprove?: OperatorApproveIdentity })
        .clawqlOperatorApprove!;
      const digest = String(req.params.quoteDigest ?? "").trim();
      if (!digest) {
        res.status(400).json({ error: "quoteDigest is required" });
        return;
      }
      try {
        const quote = await Effect.runPromise(
          getOutboundPendingQuoteEffect({
            home: resolveHome(env),
            quoteDigest: digest,
            tenantId: identity.tenantId,
          })
        );
        if (!quote) {
          res.status(404).json({ error: "no parked quote for digest (or expired / wrong tenant)" });
          return;
        }
        res.status(200).json({ ok: true, quote });
      } catch (e: unknown) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
  });

  app.post(`${base}/approve`, requireOperator, (req, res) => {
    void (async () => {
      const identity = (req as Request & { clawqlOperatorApprove?: OperatorApproveIdentity })
        .clawqlOperatorApprove!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const quoteDigest = typeof body.quoteDigest === "string" ? body.quoteDigest.trim() : "";
      if (!quoteDigest) {
        res.status(400).json({ error: "quoteDigest is required" });
        return;
      }
      // Y2: ignore body.tenantId entirely — claims / operator-key env only.
      const tenantId = identity.tenantId;
      try {
        const pending = await Effect.runPromise(
          getOutboundPendingQuoteEffect({
            home: resolveHome(env),
            quoteDigest,
            tenantId,
          })
        );
        if (!pending) {
          res.status(404).json({
            error:
              "no parked quote for this digest — re-run the payment so HITL parks amount/asset/payee/resource first (audit Y3)",
          });
          return;
        }
        const approval = await Effect.runPromise(
          recordOutboundOperatorApprovalEffect({
            home: resolveHome(env),
            quoteDigest,
            principal: identity.principal,
            tenantId,
            env,
          })
        );
        res.status(201).json({
          ok: true,
          approvalId: approval.id,
          quoteDigest: approval.quoteDigest,
          principal: approval.principal,
          tenantId: approval.tenantId,
          expiresAt: approval.expiresAt,
          quote: approval.quote,
        });
      } catch (e: unknown) {
        res.status(500).json({
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  });
}
