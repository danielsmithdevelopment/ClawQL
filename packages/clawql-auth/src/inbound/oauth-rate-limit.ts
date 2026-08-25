/**
 * In-process rate limit for MCP OAuth AS endpoints (token / authorize / revoke / id-jag).
 * Mirrors webhook-rate-limit: callable from handlers for CodeQL js/missing-rate-limiting
 * when routes are analyzed in isolation. Hosts may also attach express-rate-limit middleware.
 */

import type { Request, Response } from "express";
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

/**
 * Returns false after sending 429 when the client IP exceeded the OAuth quota.
 * Call at the top of token / authorize / revoke / id-jag handlers.
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
