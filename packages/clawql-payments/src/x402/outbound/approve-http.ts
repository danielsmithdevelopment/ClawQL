/**
 * Console / operator HTTP: POST /payments/outbound/approve
 * Body: { quoteDigest, tenantId? }. Principal from verified gateway claims.sub.
 */

import type { Express, NextFunction, Request, Response } from "express";
import { join } from "node:path";
import { Effect } from "effect";
import { recordOutboundOperatorApprovalEffect } from "./operator-approval.js";

export type AttachOutboundApproveRoutesOptions = {
  basePath?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Gateway auth middleware (applyGatewayAuth). Required — without it the
   * route is not mounted.
   */
  auth: (req: Request, res: Response, next: NextFunction) => void;
};

function resolveHome(env: NodeJS.ProcessEnv): string {
  return env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
}

export function attachOutboundApproveRoutes(
  app: Express,
  options: AttachOutboundApproveRoutesOptions
): void {
  const env = options.env ?? process.env;
  const base = (options.basePath ?? "/payments/outbound").replace(/\/$/, "");

  app.post(`${base}/approve`, options.auth, (req, res) => {
    void (async () => {
      const claims = (req as Request & { clawqlClaims?: { sub?: string; tenantId?: string } })
        .clawqlClaims;
      const principal = claims?.sub?.trim();
      if (!principal) {
        res.status(401).json({
          error: "authenticated human principal required (claims.sub)",
        });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const quoteDigest = typeof body.quoteDigest === "string" ? body.quoteDigest.trim() : "";
      if (!quoteDigest) {
        res.status(400).json({ error: "quoteDigest is required" });
        return;
      }
      const tenantId =
        (typeof body.tenantId === "string" && body.tenantId.trim()) ||
        claims?.tenantId?.trim() ||
        "default";
      try {
        const approval = await Effect.runPromise(
          recordOutboundOperatorApprovalEffect({
            home: resolveHome(env),
            quoteDigest,
            principal: `operator:${principal}`,
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
        });
      } catch (e: unknown) {
        res.status(500).json({
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  });
}
