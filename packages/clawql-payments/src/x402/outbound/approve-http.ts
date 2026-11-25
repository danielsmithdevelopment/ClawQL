/**
 * Console / operator HTTP: outbound payment approve (audit Y1–Y3, Z1–Z3).
 *
 * Auth is intentionally separate from /mcp:
 * - Dedicated operator key verified against CLAWQL_OPERATOR_APPROVE_KEY_HASH, or
 * - OIDC with role operator|admin and dedicated approve audience (Z1; auth_time-only refused).
 * Tenant always from claims / CLAWQL_TENANT_ID — never the body (Y2).
 * Principal from CLAWQL_OPERATOR_ID only on the key path (Z3).
 */

import type { Express, NextFunction, Request, Response } from "express";
import { join } from "node:path";
import { Effect } from "effect";
import {
  getOutboundPendingQuoteEffect,
  recordOutboundOperatorApprovalEffect,
} from "./operator-approval.js";
import { verifyOperatorApproveKey } from "./operator-key.js";

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
  /** "operator-key" | "oidc" — wording: operator-approved vs human-approved. */
  channel: "operator-key" | "oidc";
};

/** Default: auth_time must be within 5 minutes (audit Z1). */
export function operatorApproveAuthTimeMaxSec(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_OPERATOR_APPROVE_AUTH_TIME_MAX_SEC?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 300;
  if (!Number.isFinite(n) || n < 30) return 300;
  return Math.min(n, 3600);
}

function audienceIncludes(aud: string | string[] | undefined, required: string): boolean {
  if (!aud) return false;
  if (typeof aud === "string") return aud === required;
  return aud.includes(required);
}

/**
 * Resolve a human / operator identity for outbound approve (audit Y1/Y2/Z1/Z3).
 * Exported for unit tests.
 */
export async function resolveOutboundApproveOperator(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): Promise<
  { ok: true; identity: OperatorApproveIdentity } | { ok: false; status: number; error: string }
> {
  const presented = extractPresentedOperatorKey(req);
  const hasHash = Boolean(env.CLAWQL_OPERATOR_APPROVE_KEY_HASH?.trim());
  const hasPlain = Boolean(env.CLAWQL_OPERATOR_APPROVE_KEY?.trim());

  // Path A — operator-approved via dedicated key (hashed on server — Z2).
  if (presented && (hasHash || hasPlain)) {
    const verify = verifyOperatorApproveKey(presented, env);
    if (!verify.ok) {
      // If this looks like a JWT (OIDC), fall through to OIDC path.
      if (presented.includes(".")) {
        /* continue to OIDC */
      } else {
        return { ok: false, status: 401, error: verify.reason };
      }
    } else {
      // Z3: attribution from config only — never request headers.
      const principal = env.CLAWQL_OPERATOR_ID?.trim() || "operator-key";
      const tenantId = env.CLAWQL_TENANT_ID?.trim() || "default";
      return {
        ok: true,
        identity: {
          principal: `operator:${principal}`,
          tenantId,
          channel: "operator-key",
        },
      };
    }
  }

  const authMode = (env.CLAWQL_AUTH_MODE?.trim().toLowerCase() || "noAuth").replace(/[_-]/g, "");
  if (authMode === "noauth" || authMode === "") {
    return {
      ok: false,
      status: 401,
      error:
        "outbound approve refuses noAuth — set CLAWQL_OPERATOR_APPROVE_KEY_HASH or CLAWQL_AUTH_MODE=oidc (audit Y1)",
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
    return {
      ok: false,
      status: 401,
      error:
        "outbound approve refuses MCP API keys — set CLAWQL_OPERATOR_APPROVE_KEY_HASH or CLAWQL_AUTH_MODE=oidc (audit Y1)",
    };
  }

  // Path B — human-approved via OIDC with dedicated approve audience (Z1).
  // Dedicated audience is required — auth_time alone left a post-sign-in window
  // where the MCP session token could still approve.
  if (authMode === "oidc" || authMode === "oauth2") {
    try {
      const { loadOidcAuthConfig, verifyOidcBearerTokenEffect } = await import("clawql-auth");
      const token = extractPresentedOperatorKey(req);
      if (!token) {
        return { ok: false, status: 401, error: "Missing Bearer JWT for outbound approve" };
      }
      const base = loadOidcAuthConfig(env);
      const approveAud = env.CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE?.trim();
      if (!approveAud) {
        return {
          ok: false,
          status: 403,
          error:
            "outbound approve requires CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE (dedicated aud) — auth_time-only is refused so MCP session tokens cannot approve (audit Z1)",
        };
      }
      const mcpAud = base.audience;
      const mcpAudConflict =
        (typeof mcpAud === "string" && mcpAud === approveAud) ||
        (Array.isArray(mcpAud) && mcpAud.includes(approveAud));
      if (mcpAudConflict) {
        return {
          ok: false,
          status: 403,
          error:
            "CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE must differ from CLAWQL_AUTH_OIDC_AUDIENCE — shared aud reopens the MCP-token approve window (audit Z1)",
        };
      }
      const oidcConfig = {
        ...base,
        audience: approveAud,
      };
      const { claims, payload } = await Effect.runPromise(
        verifyOidcBearerTokenEffect(token, oidcConfig)
      );
      if (claims.virtualKeyId) {
        return {
          ok: false,
          status: 403,
          error: "outbound approve refuses virtual keys (audit Y1)",
        };
      }
      const aud = (payload.aud ?? claims.audience) as string | string[] | undefined;
      if (!audienceIncludes(aud, approveAud)) {
        return {
          ok: false,
          status: 403,
          error: `outbound approve requires JWT aud=${approveAud} (audit Z1)`,
        };
      }
      // Optional extra step-up when auth_time is present (does not replace audience).
      const requireAuthTime =
        env.CLAWQL_OPERATOR_APPROVE_REQUIRE_AUTH_TIME?.trim() === "1" ||
        env.CLAWQL_OPERATOR_APPROVE_REQUIRE_AUTH_TIME?.trim()?.toLowerCase() === "true";
      if (requireAuthTime) {
        const maxSec = operatorApproveAuthTimeMaxSec(env);
        const authTime =
          typeof payload.auth_time === "number"
            ? payload.auth_time
            : typeof claims.authTime === "number"
              ? claims.authTime
              : undefined;
        if (authTime === undefined) {
          return {
            ok: false,
            status: 403,
            error:
              "outbound approve requires OIDC auth_time when CLAWQL_OPERATOR_APPROVE_REQUIRE_AUTH_TIME=1 (audit Z1)",
          };
        }
        const ageSec = Math.floor(Date.now() / 1000) - authTime;
        if (ageSec < 0 || ageSec > maxSec) {
          return {
            ok: false,
            status: 403,
            error: `outbound approve requires auth_time within ${maxSec}s (got age=${ageSec}s) — re-authenticate (audit Z1)`,
          };
        }
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
        identity: { principal: `operator:${sub}`, tenantId, channel: "oidc" },
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
      "outbound approve requires CLAWQL_OPERATOR_APPROVE_KEY_HASH or CLAWQL_AUTH_MODE=oidc (audit Y1/Z2)",
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
          // Wording: OIDC path is human-approved; key path is operator-approved (audit Z wording).
          approvalKind: identity.channel === "oidc" ? "human-approved" : "operator-approved",
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
