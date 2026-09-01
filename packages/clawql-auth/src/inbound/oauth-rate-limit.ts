/**
 * Rate limit for MCP OAuth AS endpoints (token / authorize / revoke / id-jag / EMA admin).
 * Uses express-rate-limit so CodeQL js/missing-rate-limiting recognizes the middleware,
 * plus {@link enforceMcpOAuthRateLimit} for handlers analyzed in isolation.
 */

import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { Effect } from "effect";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function mcpOAuthRateLimitPerMinute(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> {
  return Effect.sync(() => {
    const parsed = Number.parseInt(env.CLAWQL_MCP_OAUTH_RATE_LIMIT_PER_MIN ?? "120", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
  });
}

function clientKey(req: Request): string {
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || "unknown";
}

function oauthRateLimitExceeded(res: Response): void {
  res.status(429).json({
    error: "temporarily_unavailable",
    error_description: "rate limit exceeded",
  });
}

/** Express middleware factory — preferred for CodeQL recognition on route registration. */
export function createMcpOAuthRateLimiter(env: NodeJS.ProcessEnv = process.env) {
  const max = Effect.runSync(mcpOAuthRateLimitPerMinute(env));
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientKey(req as Request),
    handler: (_req, res) => {
      oauthRateLimitExceeded(res as Response);
    },
  });
}

/**
 * Returns false after sending 429 when the client IP exceeded the OAuth quota.
 * Call at the top of token / authorize / revoke / id-jag / EMA admin handlers.
 */
export function enforceMcpOAuthRateLimit(
  req: Request,
  res: Response,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const max = Effect.runSync(mcpOAuthRateLimitPerMinute(env));
  const windowMs = 60_000;
  const key = `mcp-oauth:${clientKey(req)}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    oauthRateLimitExceeded(res);
    return false;
  }
  return true;
}

/** @internal test helper */
export function resetMcpOAuthRateLimitBucketsForTests(): void {
  buckets.clear();
}
