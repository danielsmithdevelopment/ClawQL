/**
 * Dual-process density path (ADR 0016 / DUAL-PROCESS.md):
 * Host MCP `execute` (+ optional `resume`) → Rust `clawql-dataplane` Streamable HTTP.
 *
 * Opt-in: `CLAWQL_DATAPLANE_EXECUTE_URL` (e.g. `http://clawql-dataplane:8787` or `…/mcp`).
 * Precedence over Core-in-celld when set. Bun/TS remains default when unset.
 */

import { Context, Effect, Layer } from "effect";

export const DATAPLANE_FORWARD_HONESTY =
  "Host MCP execute forwarded to clawql-dataplane (optional Cloud density path). Search/plugins/memory stay on Bun/TS. Unset CLAWQL_DATAPLANE_EXECUTE_URL for single-process host.";

export type DataplaneForwardConfig = {
  readonly url: string;
  readonly timeoutMs: number;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function resolveDataplaneForwardConfig(
  env: NodeJS.ProcessEnv = process.env
): DataplaneForwardConfig | null {
  // Explicit opt-out wins even when URL is set.
  if (env.CLAWQL_DATAPLANE_FORWARD !== undefined && env.CLAWQL_DATAPLANE_FORWARD !== "") {
    if (!envFlag("CLAWQL_DATAPLANE_FORWARD", env)) return null;
  }
  const raw =
    env.CLAWQL_DATAPLANE_EXECUTE_URL?.trim() ||
    env.CLAWQL_DATAPLANE_MCP_URL?.trim() ||
    "";
  if (!raw) return null;
  const base = raw.replace(/\/$/, "");
  const url = base.endsWith("/mcp") ? base : `${base}/mcp`;
  const timeoutMs = Number(env.CLAWQL_DATAPLANE_TIMEOUT_MS ?? 30_000);
  return {
    url,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
  };
}

export function dataplaneForwardEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => resolveDataplaneForwardConfig(env) !== null);
}

export function dataplaneForwardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(dataplaneForwardEnabledEffect(env));
}

type SessionCache = { readonly url: string; readonly sessionId: string };
let sessionCache: SessionCache | null = null;

/** Test helper. */
export function resetDataplaneSessionCache(): void {
  sessionCache = null;
}

async function ensureSession(
  cfg: DataplaneForwardConfig,
  fetchImpl: typeof fetch
): Promise<string> {
  if (sessionCache && sessionCache.url === cfg.url) return sessionCache.sessionId;

  const res = await fetchImpl(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "clawql-dataplane-forward", version: "0.1.0" },
      },
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const sid = res.headers.get("mcp-session-id");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`dataplane initialize HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  if (!sid) {
    // Stateless dataplane (CLAWQL_MCP_STATELESS=1) — empty session ok.
    sessionCache = { url: cfg.url, sessionId: "" };
    return "";
  }
  sessionCache = { url: cfg.url, sessionId: sid };
  // notifications/initialized best-effort
  try {
    await fetchImpl(cfg.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": sid,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
      signal: AbortSignal.timeout(Math.min(cfg.timeoutMs, 5_000)),
    });
  } catch {
    /* ignore */
  }
  return sid;
}

export type DataplaneForwardResult = {
  readonly content: { type: "text"; text: string }[];
  readonly transport: "dataplane-forward";
  readonly honesty: string;
};

export function callDataplaneToolEffect(
  name: "execute" | "resume",
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Effect.Effect<DataplaneForwardResult, Error> {
  return Effect.gen(function* () {
    const cfg = resolveDataplaneForwardConfig(env);
    if (!cfg) {
      return yield* Effect.fail(new Error("dataplane forward disabled (no CLAWQL_DATAPLANE_EXECUTE_URL)"));
    }
    const sessionId = yield* Effect.tryPromise({
      try: () => ensureSession(cfg, fetchImpl),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const res = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(cfg.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name, arguments: args },
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    // Refresh session if dataplane rotated it
    const newSid = res.headers.get("mcp-session-id");
    if (newSid && newSid !== sessionId) {
      sessionCache = { url: cfg.url, sessionId: newSid };
    }
    const text = yield* Effect.tryPromise({
      try: () => res.text(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    if (!res.ok) {
      return yield* Effect.fail(
        new Error(`dataplane forward HTTP ${res.status}: ${text.slice(0, 300)}`)
      );
    }
    let rpc: {
      result?: { content?: { type: string; text?: string }[]; isError?: boolean };
      error?: { message?: string };
    };
    try {
      rpc = JSON.parse(text) as typeof rpc;
    } catch {
      return yield* Effect.fail(new Error(`dataplane forward non-JSON: ${text.slice(0, 200)}`));
    }
    if (rpc.error) {
      return yield* Effect.fail(new Error(rpc.error.message ?? JSON.stringify(rpc.error)));
    }
    const content = Array.isArray(rpc.result?.content)
      ? rpc.result.content.map((c) => ({
          type: "text" as const,
          text: typeof c.text === "string" ? c.text : JSON.stringify(c),
        }))
      : [{ type: "text" as const, text }];
    if (content[0]?.text) {
      try {
        const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          parsed.proxiedFrom = "clawql-mcp";
          parsed.proxyHonesty = DATAPLANE_FORWARD_HONESTY;
          content[0] = { type: "text", text: JSON.stringify(parsed) };
        }
      } catch {
        /* leave */
      }
    }
    return {
      content,
      transport: "dataplane-forward" as const,
      honesty: DATAPLANE_FORWARD_HONESTY,
    };
  });
}

export class DataplaneForwardService extends Context.Service<
  DataplaneForwardService,
  {
    readonly enabled: () => boolean;
    readonly callTool: (
      name: "execute" | "resume",
      args: Record<string, unknown>
    ) => Effect.Effect<DataplaneForwardResult, Error>;
  }
>()("clawql/DataplaneForwardService") {}

export function dataplaneForwardLayer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Layer.Layer<DataplaneForwardService> {
  return Layer.succeed(
    DataplaneForwardService,
    DataplaneForwardService.of({
      enabled: () => dataplaneForwardEnabled(env),
      callTool: (name, args) => callDataplaneToolEffect(name, args, env, fetchImpl),
    })
  );
}
