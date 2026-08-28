/**
 * Phase 2 — Grafana Faro proxy (Cloudflare Worker).
 * Ephemeral JWT gate; no static public ingest endpoint.
 * Full implementation ships in Phase 2 — see docs/design/clawql-observability-package-spec.md §5–6.
 */

export interface FaroProxyEnv {
  readonly JWT_SIGNING_KEY: string;
  readonly ALLOY_ENDPOINT: string;
  readonly RATE_LIMITER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: FaroProxyEnv): Promise<Response> {
    const jwt = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response(null, { status: 204 });
    }

    // Phase 2: verifyJWT(jwt, env.JWT_SIGNING_KEY), rateLimitOk, isWellFormedFaroEvent, forwardToAlloy
    void env;
    return new Response(null, { status: 204 });
  },
};
