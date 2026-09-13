/**
 * Webhook rate limiting — express-rate-limit for CodeQL js/missing-rate-limiting recognition,
 * plus enforceWebhookRateLimit for handlers analyzed in isolation.
 */

import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function webhookRateLimitPerMinute(): number {
  const parsed = Number.parseInt(process.env.CLAWQL_WEBHOOK_RATE_LIMIT_PER_MIN ?? "120", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

/** Express middleware factory for inbound webhook POST routes. */
export function createWebhookRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: webhookRateLimitPerMinute(),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ ok: false, error: "rate limit exceeded" });
    },
  });
}

/** Returns false after sending 429 when the client IP exceeded the webhook quota. */
export function enforceWebhookRateLimit(req: Request, res: Response): boolean {
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
    return false;
  }
  return true;
}

/** @internal test helper */
export function resetWebhookRateLimitBucketsForTests(): void {
  buckets.clear();
}
