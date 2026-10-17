/**
 * Baseline browser / HTTP security headers for MCP HTTP and related Express surfaces.
 * Opt-out: CLAWQL_SECURITY_HEADERS=0. HSTS only when CLAWQL_HSTS=1 (TLS terminators).
 */
import { Context, Effect, Layer } from "effect";
import type { NextFunction, Request, Response } from "express";

export type SecurityHeaderMap = Readonly<Record<string, string>>;

export type SecurityHeadersOptions = {
  readonly enableHsts?: boolean;
  readonly frameAncestors?: string;
  /** Extra CSP directives merged after defaults (same-key replaces). */
  readonly cspDirectives?: Readonly<Record<string, string>>;
};

const DEFAULT_CSP: Readonly<Record<string, string>> = {
  "default-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "frame-ancestors": "'none'",
  "img-src": "'self' data:",
  // MCP JSON APIs; tighten in fronting proxies for HTML UIs.
  "script-src": "'none'",
  "style-src": "'none'",
  "connect-src": "'self'",
};

function buildCsp(directives: Readonly<Record<string, string>>): string {
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join("; ");
}

export const buildSecurityHeadersEffect = (
  options: SecurityHeadersOptions = {}
): Effect.Effect<SecurityHeaderMap> =>
  Effect.sync(() => {
    const csp = {
      ...DEFAULT_CSP,
      ...(options.cspDirectives ?? {}),
      ...(options.frameAncestors ? { "frame-ancestors": options.frameAncestors } : {}),
    };
    const headers: Record<string, string> = {
      "Content-Security-Policy": buildCsp(csp),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-site",
    };
    if (options.enableHsts) {
      headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
    }
    return headers;
  });

export function securityHeadersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CLAWQL_SECURITY_HEADERS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

export function hstsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_HSTS?.trim() === "1";
}

export const CLAWQL_SECURITY_HEADERS_TAG = "clawql/SecurityHeaders" as const;

export class SecurityHeadersService extends Context.Service<
  typeof CLAWQL_SECURITY_HEADERS_TAG,
  {
    readonly build: (options?: SecurityHeadersOptions) => Effect.Effect<SecurityHeaderMap>;
  }
>()(CLAWQL_SECURITY_HEADERS_TAG) {}

export const SecurityHeadersLive = Layer.succeed(SecurityHeadersService, {
  build: buildSecurityHeadersEffect,
});

/** Express middleware — apply early on the MCP app. */
export function applySecurityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!securityHeadersEnabled()) {
    next();
    return;
  }
  const headers = Effect.runSync(buildSecurityHeadersEffect({ enableHsts: hstsEnabled() }));
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  next();
}
