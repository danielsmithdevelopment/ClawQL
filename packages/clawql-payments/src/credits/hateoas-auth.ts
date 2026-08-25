/**
 * Gateway auth gate for hosted `/credits/*` HATEOAS/HTMX surfaces.
 *
 * When CLAWQL_AUTH_MODE is apiKey|oidc (or CLAWQL_CREDITS_HATEOAS_REQUIRE_AUTH=1),
 * money-moving and account surfaces require ATR claims. Shareable pay/QR/invite
 * landings stay public (invite remains token-gated). High-impact stage/confirm
 * also honor CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL via assertToolPolicy.
 */

import type { NextFunction, Request, Response } from "express";
import { Cause, Effect, Exit } from "effect";
import {
  assertToolPolicyEffect,
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeadersEffect,
  resolveAuthMode,
  type AtrClaims,
  type GatewayAuthConfig,
} from "clawql-auth";
import { CREDITS_TRANSFER_CONFIRM_TOOL, CREDITS_TRANSFER_STAGE_TOOL } from "./credits-service.js";
import { renderCreditsHateoasPage, wantsHtml } from "./hateoas-html.js";

export type CreditsHateoasAuthOptions = {
  env?: NodeJS.ProcessEnv;
  /** Override gateway config (e.g. inject VK resolver from MCP HTTP host). */
  authConfig?: GatewayAuthConfig;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envFalsey(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/**
 * Whether `/credits` requires gateway auth for non-public paths.
 * Default: on for apiKey/oidc, off for noAuth. Override with
 * CLAWQL_CREDITS_HATEOAS_REQUIRE_AUTH=1|0. CLAWQL_CREDITS_HATEOAS_PUBLIC=1 forces off.
 */
export function isCreditsHateoasAuthRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (envFlag("CLAWQL_CREDITS_HATEOAS_PUBLIC", env)) return false;
  if (envFalsey("CLAWQL_CREDITS_HATEOAS_REQUIRE_AUTH", env)) return false;
  if (envFlag("CLAWQL_CREDITS_HATEOAS_REQUIRE_AUTH", env)) return true;
  const mode = Effect.runSync(resolveAuthMode(env));
  return mode === "apiKey" || mode === "oidc";
}

/**
 * Paths that stay reachable without gateway auth (shareable / join).
 * `relPath` is the path under `/credits` (e.g. `/pay`, `/request/invite`).
 */
export function isCreditsHateoasPublicPath(method: string, relPath: string): boolean {
  const m = method.toUpperCase();
  const p = (relPath.split("?")[0] ?? relPath).replace(/\/+$/, "") || "/";

  if (m === "GET" && p === "/pay") return true;
  if (m === "GET" && p === "/qr.svg") return true;
  if (m === "GET" && p === "/request/invite") return true;
  if (m === "POST" && p === "/request/invite/claim") return true;
  return false;
}

/** Map route → financial MCP tool name for MFA policy (undefined = auth only). */
export function creditsHateoasHighImpactTool(method: string, relPath: string): string | undefined {
  const m = method.toUpperCase();
  const p = (relPath.split("?")[0] ?? relPath).replace(/\/+$/, "") || "/";

  if (m === "POST" && p === "/transfer/confirm") return CREDITS_TRANSFER_CONFIRM_TOOL;
  if (m === "POST" && p === "/pay/stage") return CREDITS_TRANSFER_STAGE_TOOL;
  if (m === "POST" && /^\/request\/[^/]+\/accept$/.test(p)) return CREDITS_TRANSFER_STAGE_TOOL;
  return undefined;
}

function relPathFromRequest(req: Request): string {
  // Mounted at /credits → req.path is e.g. /pay; also support unmounted use.
  const raw = `${req.baseUrl || ""}${req.path || ""}`;
  if (raw.startsWith("/credits")) {
    const rest = raw.slice("/credits".length) || "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return req.path?.startsWith("/") ? req.path : `/${req.path || ""}`;
}

function sendAuthFailure(
  req: Request,
  res: Response,
  status: number,
  title: string,
  message: string
): void {
  if (Effect.runSync(wantsHtml(req.get("accept") ?? undefined))) {
    res
      .status(status)
      .type("html")
      .send(
        Effect.runSync(
          renderCreditsHateoasPage({
            title,
            heading: title,
            summary: message,
            bodyHtml: `<p class="err">${escapeLite(message)}</p>
          <p class="note">Sign in via your IdP (Bearer JWT) or API key, then retry.
          Set <code>CLAWQL_AUTH_MODE=noAuth</code> only for local solo use.</p>
          <div class="cta-row"><a class="btn" href="/credits">Home</a></div>`,
            hideLinksPanel: true,
          })
        )
      );
    return;
  }
  res.status(status).json({ error: message });
}

function authErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const rec = e as Record<string, unknown>;
    if (typeof rec.reason === "string" && rec.reason.trim()) return rec.reason;
    // Effect Data.TaggedError often exposes message via toString / Inspectable
    if (typeof rec.message === "string" && rec.message && rec.message !== "An error has occurred") {
      return rec.message;
    }
  }
  if (e instanceof Error && e.message && e.message !== "An error has occurred") return e.message;
  return "Missing or invalid credentials (Bearer JWT / API key required)";
}

function escapeLite(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type CreditsAuthenticatedRequest = Request & { clawqlClaims?: AtrClaims };

/**
 * Express middleware: gate non-public `/credits/*` when gateway auth is required.
 */
export function createCreditsHateoasAuthMiddleware(
  options: CreditsHateoasAuthOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const env = options.env ?? process.env;
  const authConfig = options.authConfig ?? Effect.runSync(loadGatewayAuthConfig(env));

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        if (!isCreditsHateoasAuthRequired(env)) {
          next();
          return;
        }
        const rel = relPathFromRequest(req);
        if (isCreditsHateoasPublicPath(req.method, rel)) {
          next();
          return;
        }

        const exit = await Effect.runPromiseExit(
          resolveAtrClaimsFromHeadersEffect(req.headers, authConfig)
        );
        if (Exit.isFailure(exit)) {
          sendAuthFailure(
            req,
            res,
            401,
            "Sign in required",
            authErrorMessage(Cause.squash(exit.cause))
          );
          return;
        }
        const claims = exit.value;

        const tool = creditsHateoasHighImpactTool(req.method, rel);
        if (tool) {
          try {
            Effect.runSync(assertToolPolicyEffect(claims, tool, { env }));
          } catch (e) {
            sendAuthFailure(req, res, 403, "MFA required", authErrorMessage(e));
            return;
          }
        }

        (req as CreditsAuthenticatedRequest).clawqlClaims = claims;
        next();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendAuthFailure(req, res, 500, "Auth error", msg);
      }
    })();
  };
}
