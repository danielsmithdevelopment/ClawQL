/**
 * Lightweight in-process rate limiting for inbound webhook routes (CodeQL js/missing-rate-limiting).
 */

import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function webhookRateLimitPerMinute(): number {
  const parsed = Number.parseInt(process.env.CLAWQL_WEBHOOK_RATE_LIMIT_PER_MIN ?? "120", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

/** Express middleware — caps webhook POST volume per client IP per minute. */
export function webhookRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const max = webhookRateLimitPerMinute();
  const windowMs = 60_000;
  const key = req.ip ?? "unknown";
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    res.status(429).json({ ok: false, error: "rate limit exceeded" });
    return;
  }
  next();
}

/** @internal test helper */
export function resetWebhookRateLimitBucketsForTests(): void {
  buckets.clear();
}
