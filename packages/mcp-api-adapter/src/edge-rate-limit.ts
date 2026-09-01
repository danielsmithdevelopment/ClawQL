/**
 * Edge auth rate limit for mcp-api-adapter.
 * Uses express-rate-limit for CodeQL js/missing-rate-limiting recognition.
 */

import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";

/**
 * Express middleware for authenticated adapter routes.
 * Default: 300 req/min (`MCP_API_ADAPTER_RATE_LIMIT_PER_MIN`). Skips `/healthz`.
 */
export function createEdgeAuthRateLimiter(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const parsed = Number.parseInt(env.MCP_API_ADAPTER_RATE_LIMIT_PER_MIN ?? "300", 10);
  const max = Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/healthz",
    handler: (_req, res) => {
      res.status(429).json({ error: "rate_limit_exceeded" });
    },
  });
}
