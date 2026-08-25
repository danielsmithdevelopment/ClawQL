/**
 * In-process rate limit for mcp-api-adapter edge auth middleware.
 * Satisfies CodeQL js/missing-rate-limiting on authorization handlers.
 */

import type { Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || "unknown";
}

/**
 * Returns false after sending 429 when the client IP exceeded the quota.
 * Default: 300 req/min (`MCP_API_ADAPTER_RATE_LIMIT_PER_MIN`).
 */
export function enforceEdgeAuthRateLimit(
  req: Request,
  res: Response,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const parsed = Number.parseInt(env.MCP_API_ADAPTER_RATE_LIMIT_PER_MIN ?? "300", 10);
  const max = Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
  const windowMs = 60_000;
  const key = `mcp-api-adapter:${clientKey(req)}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    res.status(429).json({ error: "rate_limit_exceeded" });
    return false;
  }
  return true;
}

/** @internal test helper */
export function resetEdgeAuthRateLimitBucketsForTests(): void {
  buckets.clear();
}
