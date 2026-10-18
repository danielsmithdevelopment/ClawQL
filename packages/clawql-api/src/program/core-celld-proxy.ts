/**
 * Opt-in proxy: Node MCP search/execute → celld CoreToolsDO (`POST /mcp`).
 *
 * When `CLAWQL_CORE_CELLD_URL` is set (e.g. `http://127.0.0.1:9888/mcp`), every
 * Core tools/call from this process is handled inside the celld isolate.
 * Honesty: slim catalog only — not full clawql-api.
 */

import { Context, Effect, Layer } from "effect";

export const CORE_CELLD_PROXY_HONESTY =
  "Node MCP proxied to celld CoreToolsDO (CLAWQL_CORE_CELLD_URL). Slim in-isolate Core — not full catalog/vault/gRPC.";

export type CoreCelldProxyConfig = {
  readonly url: string;
  readonly timeoutMs: number;
};

export function resolveCoreCelldProxyConfig(
  env: NodeJS.ProcessEnv = process.env
): CoreCelldProxyConfig | null {
  const raw = env.CLAWQL_CORE_CELLD_URL?.trim();
  if (!raw) return null;
  const url = raw.replace(/\/$/, "");
  const mcpUrl = url.endsWith("/mcp") ? url : `${url}/mcp`;
  const timeoutMs = Number(env.CLAWQL_CORE_CELLD_TIMEOUT_MS ?? 15_000);
  return {
    url: mcpUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000,
  };
}

export type CoreCelldToolResult = {
  readonly content: { type: "text"; text: string }[];
  readonly transport: "celld-isolate-proxy";
  readonly honesty: string;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** True when operators asked for Core-in-celld proxy (URL or explicit flag+URL). */
export function coreCelldProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!resolveCoreCelldProxyConfig(env)) return false;
  // URL alone is enough; CLAWQL_CORE_IN_CELLD=0 can disable.
  if (env.CLAWQL_CORE_IN_CELLD !== undefined && !envFlag("CLAWQL_CORE_IN_CELLD", env)) {
    return false;
  }
  return true;
}

export function callCoreCelldToolEffect(
  name: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Effect.Effect<CoreCelldToolResult, Error> {
  return Effect.gen(function* () {
    const cfg = resolveCoreCelldProxyConfig(env);
    if (!cfg) {
      return yield* Effect.fail(new Error("CLAWQL_CORE_CELLD_URL unset"));
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
    // Stamp proxy honesty if payload is JSON object.
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
      callTool: (name, args) => callCoreCelldToolEffect(name, args, env, fetchImpl),
    })
  );
}
