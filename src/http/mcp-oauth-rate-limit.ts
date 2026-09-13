/**
 * Host-side express-rate-limit middleware for MCP OAuth routes.
 * Complements in-handler {@link enforceMcpOAuthRateLimit} (clawql-auth) for CodeQL.
 */

import rateLimit from "express-rate-limit";

function mcpOAuthRateLimitPerMinute(): number {
  const parsed = Number.parseInt(process.env.CLAWQL_MCP_OAUTH_RATE_LIMIT_PER_MIN ?? "120", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

/** Express middleware for `/oauth/token`, `/oauth/revoke`, `/oauth/authorize`, `/oauth/id-jag/*`. */
export function createMcpOAuthRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: mcpOAuthRateLimitPerMinute(),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: "temporarily_unavailable",
        error_description: "rate limit exceeded",
      });
    },
  });
}
