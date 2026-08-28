import { enrichExceptions } from "./enrich.js";
import { verifyJwt } from "./jwt.js";
import { DROP, checkRateLimit, parseAllowedOrigins } from "./rate-limit.js";
import { validatePayload } from "./schema.js";
import type { FaroProxyEnv, JwtClaims } from "./types.js";

export interface FaroHandlerDeps {
  readonly verifyJwt: typeof verifyJwt;
  readonly validatePayload: typeof validatePayload;
  readonly enrichExceptions: typeof enrichExceptions;
  readonly checkRateLimit: typeof checkRateLimit;
  readonly fetchUpstream: typeof fetch;
  readonly now: () => number;
}

export const defaultFaroHandlerDeps = (): FaroHandlerDeps => ({
  verifyJwt,
  validatePayload,
  enrichExceptions,
  checkRateLimit,
  fetchUpstream: fetch,
  now: () => Date.now(),
});

export interface FaroHandlerState {
  readonly rateBuckets: Map<string, { count: number; resetAt: number }>;
}

export const createFaroHandlerState = (): FaroHandlerState => ({
  rateBuckets: new Map(),
});

const corsPreflight = (request: Request, allowed: Set<string>): Response => {
  const origin = request.headers.get("Origin") ?? "";
  if (!allowed.has(origin) && !allowed.has("*")) return DROP;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};

const corsAccepted = (reqOrigin: string | null, allowed: Set<string>): Record<string, string> | undefined => {
  if (reqOrigin && (allowed.has(reqOrigin) || allowed.has("*"))) {
    return { "Access-Control-Allow-Origin": reqOrigin, Vary: "Origin" };
  }
  return undefined;
};

export const handleFaroRequest = async (
  request: Request,
  env: FaroProxyEnv,
  state: FaroHandlerState,
  deps: FaroHandlerDeps = defaultFaroHandlerDeps()
): Promise<Response> => {
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (request.method === "OPTIONS") {
    return corsPreflight(request, allowed);
  }

  if (request.method !== "POST") return DROP;

  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !env.JWT_SIGNING_KEY) return DROP;

  const claims: JwtClaims | null = await deps.verifyJwt(token, env.JWT_SIGNING_KEY);
  if (!claims) return DROP;
  if (claims.project !== env.PROJECT_ID) return DROP;
  if (!allowed.has(claims.origin) && !allowed.has("*")) return DROP;

  const reqOrigin = request.headers.get("Origin");
  if (reqOrigin && reqOrigin !== claims.origin && !allowed.has("*")) return DROP;

  const rateLimit = Number.parseInt(env.RATE_LIMIT_PER_MINUTE ?? "60", 10);
  if (!deps.checkRateLimit(state.rateBuckets, claims.sub, rateLimit, deps.now())) return DROP;

  const maxBytes = Number.parseInt(env.MAX_BODY_BYTES ?? "65536", 10);
  const raw = await request.arrayBuffer();
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return DROP;
  }

  const schema = deps.validatePayload(parsed, maxBytes, raw.byteLength);
  if (!schema.ok) return DROP;

  const enriched = await deps.enrichExceptions(schema.value);

  const upstream = await deps.fetchUpstream(env.ALLOY_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telemetry-Session": claims.sub,
      "X-Telemetry-Project": claims.project,
      "X-Telemetry-Origin": claims.origin,
    },
    body: JSON.stringify(enriched),
  });

  if (!upstream.ok) {
    console.error("alloy_forward_failed", upstream.status);
  }

  return new Response(null, {
    status: 204,
    headers: corsAccepted(reqOrigin, allowed),
  });
};
