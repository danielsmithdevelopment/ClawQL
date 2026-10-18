/**
 * Core-in-celld proxy: Node MCP search/execute → celld CoreToolsDO (`POST /mcp`).
 *
 * Default posture: prefer celld (slim in-isolate Core). Reasons to stay on Node:
 * - `CLAWQL_CORE_IN_CELLD=0` or `CLAWQL_FORCE_NODE_CORE=1`
 * - default localhost celld unreachable (auto fall-back; no 15s hang)
 * - memory tools / vault / gRPC never go through this proxy
 *
 * Explicit `CLAWQL_CORE_CELLD_URL` still wins over the default localhost URL.
 */

import { Context, Effect, Layer } from "effect";

/** Canonical local CoreToolsDO MCP endpoint (`clawql streams celld dev --port 9888`). */
export const DEFAULT_CORE_CELLD_MCP_URL = "http://127.0.0.1:9888/mcp";

export const CORE_CELLD_PROXY_HONESTY =
  "Node MCP proxied to celld CoreToolsDO (default). Slim in-isolate Core — not full catalog/vault/gRPC. Escape: CLAWQL_CORE_IN_CELLD=0 or CLAWQL_FORCE_NODE_CORE=1.";

export type CoreCelldProxyConfig = {
  readonly url: string;
  readonly timeoutMs: number;
  /** True when URL came from DEFAULT_CORE_CELLD_MCP_URL (probe before enable). */
  readonly usingDefaultUrl: boolean;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Prefer celld Core unless explicitly disabled.
 * Unset `CLAWQL_CORE_IN_CELLD` → prefer on (product default).
 */
export function preferCoreInCelld(env: NodeJS.ProcessEnv = process.env): boolean {
  if (envFlag("CLAWQL_FORCE_NODE_CORE", env)) return false;
  if (env.CLAWQL_CORE_IN_CELLD !== undefined && env.CLAWQL_CORE_IN_CELLD !== "") {
    return envFlag("CLAWQL_CORE_IN_CELLD", env);
  }
  return true;
}

export function resolveCoreCelldProxyConfig(
  env: NodeJS.ProcessEnv = process.env
): CoreCelldProxyConfig | null {
  if (!preferCoreInCelld(env)) return null;
  const explicit = env.CLAWQL_CORE_CELLD_URL?.trim();
  const raw = explicit || DEFAULT_CORE_CELLD_MCP_URL;
  const url = raw.replace(/\/$/, "");
  const mcpUrl = url.endsWith("/mcp") ? url : `${url}/mcp`;
  const timeoutMs = Number(env.CLAWQL_CORE_CELLD_TIMEOUT_MS ?? 15_000);
  return {
    url: mcpUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000,
    usingDefaultUrl: !explicit,
  };
}

type ReachCache = { readonly url: string; readonly ok: boolean; readonly at: number };
let reachCache: ReachCache | null = null;
const REACH_TTL_MS = 30_000;
const DEFAULT_PROBE_TIMEOUT_MS = 400;

function healthUrlFromMcp(mcpUrl: string): string {
  const base = mcpUrl.replace(/\/mcp\/?$/, "");
  return `${base}/health`;
}

/**
 * Fast reachability probe (cached). Default URL must pass before proxy enables;
 * explicit URL is trusted without probe (operator opted in).
 */
export async function probeCoreCelldReachable(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const cfg = resolveCoreCelldProxyConfig(env);
  if (!cfg) return false;
  if (!cfg.usingDefaultUrl) return true;

  const now = Date.now();
  if (reachCache && reachCache.url === cfg.url && now - reachCache.at < REACH_TTL_MS) {
    return reachCache.ok;
  }

  const probeMs = Number(env.CLAWQL_CORE_CELLD_PROBE_MS ?? DEFAULT_PROBE_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(probeMs) && probeMs > 0 ? probeMs : DEFAULT_PROBE_TIMEOUT_MS;

  let ok = false;
  try {
    const res = await fetchImpl(healthUrlFromMcp(cfg.url), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  reachCache = { url: cfg.url, ok, at: now };
  return ok;
}

/** Test helper — clear reachability cache. */
export function resetCoreCelldReachCache(): void {
  reachCache = null;
}

/**
 * Sync enable check.
 * - Explicit URL + prefer → enabled (no probe).
 * - Default URL → enabled only when last probe succeeded (call
 *   {@link probeCoreCelldReachable} / {@link coreCelldProxyEnabledAsync} first).
 */
export function coreCelldProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = resolveCoreCelldProxyConfig(env);
  if (!cfg) return false;
  if (!cfg.usingDefaultUrl) return true;
  if (reachCache && reachCache.url === cfg.url) return reachCache.ok;
  return false;
}

/** Prefer-celld enablement with probe (use from MCP tool handlers). */
export async function coreCelldProxyEnabledAsync(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!resolveCoreCelldProxyConfig(env)) return false;
  return probeCoreCelldReachable(env, fetchImpl);
}

export type CoreCelldToolResult = {
  readonly content: { type: "text"; text: string }[];
  readonly transport: "celld-isolate-proxy";
  readonly honesty: string;
};

export function callCoreCelldToolEffect(
  name: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Effect.Effect<CoreCelldToolResult, Error> {
  return Effect.gen(function* () {
    const cfg = resolveCoreCelldProxyConfig(env);
    if (!cfg) {
      return yield* Effect.fail(new Error("Core-in-celld disabled (Node escape hatch)"));
    }
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: args },
    };
    const res = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(cfg.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-11-25",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const text = yield* Effect.tryPromise({
      try: () => res.text(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    if (!res.ok) {
      return yield* Effect.fail(new Error(`celld Core proxy HTTP ${res.status}: ${text.slice(0, 300)}`));
    }
    let rpc: {
      result?: { content?: { type: string; text?: string }[]; isError?: boolean };
      error?: { message?: string };
    };
    try {
      rpc = JSON.parse(text) as typeof rpc;
    } catch {
      return yield* Effect.fail(new Error(`celld Core proxy non-JSON: ${text.slice(0, 200)}`));
    }
    if (rpc.error) {
      return yield* Effect.fail(new Error(rpc.error.message ?? JSON.stringify(rpc.error)));
    }
    const content = Array.isArray(rpc.result?.content)
      ? rpc.result.content.map((c) => ({
          type: "text" as const,
          text: typeof c.text === "string" ? c.text : JSON.stringify(c),
        }))
      : [{ type: "text" as const, text: text }];
    if (content[0]?.text) {
      try {
        const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          parsed.proxiedFrom = "clawql-mcp";
          parsed.proxyHonesty = CORE_CELLD_PROXY_HONESTY;
          content[0] = { type: "text", text: JSON.stringify(parsed) };
        }
      } catch {
        // leave text as-is
      }
    }
    return {
      content,
      transport: "celld-isolate-proxy" as const,
      honesty: CORE_CELLD_PROXY_HONESTY,
    };
  });
}

export class CoreCelldProxyService extends Context.Service<
  CoreCelldProxyService,
  {
    readonly enabled: () => boolean;
    readonly prefer: () => boolean;
    readonly callTool: (
      name: string,
      args: Record<string, unknown>
    ) => Effect.Effect<CoreCelldToolResult, Error>;
  }
>()("clawql/CoreCelldProxyService") {}

export function coreCelldProxyLayer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Layer.Layer<CoreCelldProxyService> {
  return Layer.succeed(
    CoreCelldProxyService,
    CoreCelldProxyService.of({
      enabled: () => coreCelldProxyEnabled(env),
      prefer: () => preferCoreInCelld(env),
      callTool: (name, args) => callCoreCelldToolEffect(name, args, env, fetchImpl),
    })
  );
}
