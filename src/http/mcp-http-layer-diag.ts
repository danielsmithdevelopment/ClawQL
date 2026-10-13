/**
 * HTTP-path layer diagnostics for stall bisect.
 *
 * Kill switches (bench / diagnostic only — not product defaults):
 *   CLAWQL_HTTP_SKIP_AUTH=1            — bypass gateway auth middleware (admin claims)
 *   CLAWQL_HTTP_SKIP_PRUNE=1           — skip post-POST streamMapping prune
 *   CLAWQL_HTTP_SKIP_REQUEST_CONTEXT=1 — skip ALS runWithMcpRequestContext
 *
 * Event log (spike timestamp correlation):
 *   CLAWQL_HTTP_LAYER_EVENTS=1 — stderr `[clawql-http-layer]` lines with ISO `t=`
 *
 * Startup banner always prints once from createMcpHttpApp so boards record which
 * HTTP-only suspects are on/off (auth mode, OTel, session idle, audit, prune, …).
 */

import { Effect } from "effect";

function envTruthy(raw: string | undefined): boolean {
  const t = raw?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

function envFlagOff(raw: string | undefined): boolean {
  const t = raw?.trim().toLowerCase();
  return t === "0" || t === "false" || t === "no";
}

export type HttpLayerFlags = {
  readonly skipAuth: boolean;
  readonly skipPrune: boolean;
  readonly skipRequestContext: boolean;
  readonly layerEvents: boolean;
  readonly authMode: string;
  readonly otelTracing: boolean;
  readonly sessionIdleMs: number;
  readonly auditToolCalls: boolean;
  readonly httpSkipPayments: boolean;
  readonly httpSkipGraphql: boolean;
  readonly httpPerf: boolean;
  readonly lokiPushUrlSet: boolean;
};

export const resolveHttpLayerFlags = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<HttpLayerFlags> =>
  Effect.sync(() => {
    const idleRaw = env.CLAWQL_MCP_SESSION_IDLE_MS?.trim();
    const idleN = idleRaw ? Number(idleRaw) : 0;
    return {
      skipAuth: envTruthy(env.CLAWQL_HTTP_SKIP_AUTH),
      skipPrune: envTruthy(env.CLAWQL_HTTP_SKIP_PRUNE),
      skipRequestContext: envTruthy(env.CLAWQL_HTTP_SKIP_REQUEST_CONTEXT),
      layerEvents: envTruthy(env.CLAWQL_HTTP_LAYER_EVENTS),
      authMode: (env.CLAWQL_AUTH_MODE ?? "noAuth").trim() || "noAuth",
      otelTracing: envTruthy(env.CLAWQL_ENABLE_OTEL_TRACING),
      sessionIdleMs:
        Number.isFinite(idleN) && idleN > 0 ? Math.floor(idleN) : 0,
      auditToolCalls: !envFlagOff(env.CLAWQL_AUDIT_TOOL_CALLS),
      httpSkipPayments: envTruthy(env.CLAWQL_HTTP_SKIP_PAYMENTS),
      httpSkipGraphql: envTruthy(env.CLAWQL_HTTP_SKIP_GRAPHQL),
      httpPerf: envTruthy(env.CLAWQL_HTTP_PERF),
      lokiPushUrlSet: Boolean(env.CLAWQL_LOKI_PUSH_URL?.trim()),
    };
  });

/** One-line layer map for stderr — correlate with board env. */
export const formatHttpLayerBanner = (flags: HttpLayerFlags): string =>
  `[clawql-http-layer] banner ` +
  `auth_mode=${flags.authMode} skip_auth=${flags.skipAuth ? 1 : 0} ` +
  `otel=${flags.otelTracing ? 1 : 0} session_idle_ms=${flags.sessionIdleMs} ` +
  `audit=${flags.auditToolCalls ? 1 : 0} skip_prune=${flags.skipPrune ? 1 : 0} ` +
  `skip_als=${flags.skipRequestContext ? 1 : 0} ` +
  `skip_payments=${flags.httpSkipPayments ? 1 : 0} skip_graphql=${flags.httpSkipGraphql ? 1 : 0} ` +
  `http_perf=${flags.httpPerf ? 1 : 0} loki_url=${flags.lokiPushUrlSet ? 1 : 0} ` +
  `events=${flags.layerEvents ? 1 : 0}`;

export const logHttpLayerBanner = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<HttpLayerFlags> =>
  Effect.gen(function* () {
    const flags = yield* resolveHttpLayerFlags(env);
    console.error(formatHttpLayerBanner(flags));
    return flags;
  });

export type HttpLayerEventKind =
  | "auth_resolve"
  | "auth_skip"
  | "prune"
  | "als_enter"
  | "als_skip"
  | "cache_miss"
  | "otel_export"
  | "budget_flush";

/**
 * Spike-correlation log.
 *
 * - Always emits when `durationMs` ≥ `CLAWQL_HTTP_LAYER_EVENT_SLOW_MS` (default **20**),
 *   so rare stalls surface without enabling a per-request flood.
 * - `CLAWQL_HTTP_LAYER_EVENTS=1` emits every call (use only on short boards).
 * - `force: true` always emits (startup / rare cache-miss hooks).
 */
export const logHttpLayerEvent = (opts: {
  readonly kind: HttpLayerEventKind;
  readonly durationMs?: number;
  readonly detail?: string;
  readonly force?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<void> =>
  Effect.sync(() => {
    const env = opts.env ?? process.env;
    const eventsOn = envTruthy(env.CLAWQL_HTTP_LAYER_EVENTS);
    const slowMs = Number.parseFloat(env.CLAWQL_HTTP_LAYER_EVENT_SLOW_MS ?? "20") || 20;
    const dur = opts.durationMs;
    const slow = dur != null && dur >= slowMs;
    if (!opts.force && !eventsOn && !slow) return;
    const parts = [
      `[clawql-http-layer]`,
      `kind=${opts.kind}`,
      `t=${new Date().toISOString()}`,
    ];
    if (dur != null) parts.push(`duration_ms=${dur.toFixed(3)}`);
    if (opts.detail) parts.push(opts.detail);
    console.error(parts.join(" "));
  });
