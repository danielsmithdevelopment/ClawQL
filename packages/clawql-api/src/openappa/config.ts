import { Effect } from "effect";
import type { OpenAppaAdapter } from "./types.js";
import { isExecutePathTool, resolveNativeToolPolicy } from "../governance/native-tool-policy.js";

export type OpenAppaConfig = {
  readonly baseUrl: string;
  readonly adapter: OpenAppaAdapter;
  /** MCP server segment in `mcp__<server>__<tool>` wire spelling. */
  readonly mcpServer: string;
  /**
   * Read-only tools only. Writes / destructive / execute-path always fail closed
   * on sidecar outage or timeout — never allowed.
   */
  readonly readFailurePolicy: "block" | "warn";
  /** Hard timeout budget for `POST /hook` (ms). Exceeded → same as sidecar down. */
  readonly timeoutMs: number;
  /** Brief allow-decision cache TTL (ms). `0` disables. */
  readonly allowCacheMs: number;
  /**
   * Bearer token for non-loopback sidecars (`CLAWQL_OPENAPPA_AUTH_TOKEN`).
   * Required when `baseUrl` is not loopback.
   */
  readonly authToken: string | null;
  readonly isLoopback: boolean;
};

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Opt-in Layer 5 — OpenAPPA sidecar via PROTOCOL=1 `POST /hook`. */
export function openAppaEnabledEffect(): Effect.Effect<boolean> {
  return Effect.sync(() => envTruthy(process.env.CLAWQL_ENABLE_OPENAPPA));
}

export function openAppaEnabled(): boolean {
  return Effect.runSync(openAppaEnabledEffect());
}

function parseAdapter(raw: string | undefined): OpenAppaAdapter {
  const t = (raw ?? "opencode").trim().toLowerCase();
  if (t === "claude-code" || t === "kagent" || t === "opencode") return t;
  return "opencode";
}

/** True when the OpenAPPA base URL targets loopback (no remote auth required). */
export function isLoopbackOpenAppaUrlEffect(baseUrl: string): Effect.Effect<boolean> {
  return Effect.sync(() => {
    try {
      const u = new URL(baseUrl);
      const host = u.hostname.toLowerCase();
      return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
    } catch {
      return false;
    }
  });
}

/**
 * Mutating tools (write / destructive / execute-path) must fail closed on
 * sidecar outage. Reads may use `readFailurePolicy`.
 */
export function openAppaToolIsMutatingEffect(toolName: string): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (isExecutePathTool(toolName)) return true;
    const kind = resolveNativeToolPolicy(toolName).kind;
    return kind === "write" || kind === "destructive";
  });
}

export function openAppaToolIsMutating(toolName: string): boolean {
  return Effect.runSync(openAppaToolIsMutatingEffect(toolName));
}

/**
 * Whether a transport failure may fail-open for this tool.
 * Writes always false. Reads only when `readFailurePolicy === "warn"`.
 */
export function openAppaMayFailOpenEffect(
  config: OpenAppaConfig,
  toolName: string
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const mutating = yield* openAppaToolIsMutatingEffect(toolName);
    if (mutating) return false;
    return config.readFailurePolicy === "warn";
  });
}

export function loadOpenAppaConfigEffect(): Effect.Effect<OpenAppaConfig | null, Error> {
  return Effect.gen(function* () {
    const enabled = yield* openAppaEnabledEffect();
    if (!enabled) return null;
    const baseUrl = (
      process.env.CLAWQL_OPENAPPA_URL?.trim() || "http://127.0.0.1:8789"
    ).replace(/\/$/, "");
    const isLoopback = yield* isLoopbackOpenAppaUrlEffect(baseUrl);
    const authToken = process.env.CLAWQL_OPENAPPA_AUTH_TOKEN?.trim() || null;
    if (!isLoopback && !authToken) {
      return yield* Effect.fail(
        new Error(
          "CLAWQL_OPENAPPA_URL is not loopback; set CLAWQL_OPENAPPA_AUTH_TOKEN (or use mTLS) before enabling OpenAPPA"
        )
      );
    }

    // Reads: CLAWQL_OPENAPPA_READ_FAILURE_POLICY, else CLAWQL_OPENAPPA_FAILURE_POLICY, else block.
    // Writes always fail closed regardless of these flags.
    const readRaw =
      process.env.CLAWQL_OPENAPPA_READ_FAILURE_POLICY?.trim().toLowerCase() ||
      process.env.CLAWQL_OPENAPPA_FAILURE_POLICY?.trim().toLowerCase();
    const readFailurePolicy = readRaw === "warn" ? "warn" : "block";

    // Hard timeout budget — exceeded → sidecar-down path (fail closed for writes).
    const timeoutRaw = Number(process.env.CLAWQL_OPENAPPA_TIMEOUT_MS?.trim() || "2000");
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.min(timeoutRaw, 30_000) : 2000;

    const cacheRaw = Number(process.env.CLAWQL_OPENAPPA_ALLOW_CACHE_MS?.trim() || "0");
    const allowCacheMs = Number.isFinite(cacheRaw) && cacheRaw > 0 ? Math.min(cacheRaw, 5_000) : 0;

    return {
      baseUrl,
      adapter: parseAdapter(process.env.CLAWQL_OPENAPPA_ADAPTER),
      mcpServer: process.env.CLAWQL_OPENAPPA_MCP_SERVER?.trim() || "clawql",
      readFailurePolicy,
      timeoutMs,
      allowCacheMs,
      authToken,
      isLoopback,
    } satisfies OpenAppaConfig;
  });
}

export function loadOpenAppaConfig(): OpenAppaConfig | null {
  return Effect.runSync(loadOpenAppaConfigEffect().pipe(Effect.orElseSucceed(() => null)));
}

/** Host wire spelling for the opencode / claude-code adapters. */
export function openAppaWireToolNameEffect(
  toolName: string,
  mcpServer: string
): Effect.Effect<string> {
  return Effect.sync(() => {
    if (toolName.startsWith("mcp__") || toolName.includes("/")) return toolName;
    return `mcp__${mcpServer}__${toolName}`;
  });
}

export function openAppaWireToolName(toolName: string, mcpServer: string): string {
  return Effect.runSync(openAppaWireToolNameEffect(toolName, mcpServer));
}
