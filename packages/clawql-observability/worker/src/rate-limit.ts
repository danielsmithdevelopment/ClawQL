/** Rolling 60s in-memory rate limit keyed by telemetry session id. */
export interface RateBucket {
  count: number;
  resetAt: number;
}

export const checkRateLimit = (
  buckets: Map<string, RateBucket>,
  sessionId: string,
  limit: number,
  now = Date.now()
): boolean => {
  const bucket = buckets.get(sessionId);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(sessionId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
};

export const parseAllowedOrigins = (raw: string): Set<string> =>
  new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

/** Silent drop — never leak why validation failed to an attacker. */
export const DROP = new Response(null, { status: 204 });
