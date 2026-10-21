import { Effect } from "effect";
import { resolveSecretStore, type SecretStore } from "clawql-auth";
import type { OpenAppaAdapter } from "./types.js";
import { isExecutePathTool, resolveNativeToolPolicy } from "../governance/native-tool-policy.js";

/** SecretStore paths — never log values. Env store maps to CLAWQL_SECRET_OPENAPPA_*. */
export const OPENAPPA_AUTH_TOKEN_SECRET_PATH = "openappa/auth_token";
export const OPENAPPA_AUTH_TOKEN_PREVIOUS_SECRET_PATH = "openappa/auth_token_previous";

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
  /** Hard timeout budget for `POST /hook` (ms). Default 250. Exceeded → fail closed. */
  readonly timeoutMs: number;
  /** Brief allow-decision cache TTL (ms). Default 250. Invalidated on deny / circuit open / policy epoch bump. */
  readonly allowCacheMs: number;
  /**
   * Bearer tokens for non-loopback sidecars: [current, previous?].
   * Loaded from SecretStore; never logged. Previous enables rotation overlap.
   */
  readonly authTokens: readonly string[];
  readonly isLoopback: boolean;
  readonly circuitFailureThreshold: number;
  readonly circuitCooldownMs: number;
  /**
   * Operator-bumped epoch (or battery fingerprint). Changing it clears allow-cache.
   */
  readonly policyEpoch: string;
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

/**
 * Load auth tokens from SecretStore (preferred) with safe env fallbacks.
 * Never returns values into logs — callers must not stringify config wholesale.
 *
 * Resolution order for current token:
 * 1. SecretStore `openappa/auth_token`
 * 2. Env `CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN` (env store mapping)
 * 3. Legacy `CLAWQL_OPENAPPA_AUTH_TOKEN` (deprecated; still accepted, never logged)
 *
 * Previous (rotation overlap): SecretStore `openappa/auth_token_previous`
 * or `CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN_PREVIOUS`.
 */
export function loadOpenAppaAuthTokensEffect(
  store?: SecretStore
): Effect.Effect<readonly string[], Error> {
  return Effect.gen(function* () {
    const secretStore = store ?? resolveSecretStore();
    const currentFromStore = yield* secretStore.getSecret(OPENAPPA_AUTH_TOKEN_SECRET_PATH).pipe(
      Effect.mapError(
        (e) => new Error(`OpenAPPA auth token secret read failed: ${e.reason ?? "unknown"}`)
      )
    );
    const previousFromStore = yield* secretStore
      .getSecret(OPENAPPA_AUTH_TOKEN_PREVIOUS_SECRET_PATH)
      .pipe(
        Effect.mapError(
          (e) => new Error(`OpenAPPA previous auth token secret read failed: ${e.reason ?? "unknown"}`)
        )
      );

    const current =
      currentFromStore?.trim() ||
      process.env.CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN?.trim() ||
      process.env.CLAWQL_OPENAPPA_AUTH_TOKEN?.trim() ||
      null;
    const previous =
      previousFromStore?.trim() ||
      process.env.CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN_PREVIOUS?.trim() ||
      process.env.CLAWQL_OPENAPPA_AUTH_TOKEN_PREVIOUS?.trim() ||
      null;

    const tokens: string[] = [];
    if (current) tokens.push(current);
    if (previous && previous !== current) tokens.push(previous);
    return tokens;
  });
}

export function loadOpenAppaConfigEffect(
  options: { readonly secretStore?: SecretStore } = {}
): Effect.Effect<OpenAppaConfig | null, Error> {
  return Effect.gen(function* () {
    const enabled = yield* openAppaEnabledEffect();
    if (!enabled) return null;
    const baseUrl = (
      process.env.CLAWQL_OPENAPPA_URL?.trim() || "http://127.0.0.1:8789"
    ).replace(/\/$/, "");
    const isLoopback = yield* isLoopbackOpenAppaUrlEffect(baseUrl);
    const authTokens = yield* loadOpenAppaAuthTokensEffect(options.secretStore);
    if (!isLoopback && authTokens.length === 0) {
      return yield* Effect.fail(
        new Error(
          "CLAWQL_OPENAPPA_URL is not loopback; store token at SecretStore path openappa/auth_token (or CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN)"
        )
      );
    }

    // Reads: CLAWQL_OPENAPPA_READ_FAILURE_POLICY, else CLAWQL_OPENAPPA_FAILURE_POLICY, else block.
    // Writes always fail closed regardless of these flags.
    const readRaw =
      process.env.CLAWQL_OPENAPPA_READ_FAILURE_POLICY?.trim().toLowerCase() ||
      process.env.CLAWQL_OPENAPPA_FAILURE_POLICY?.trim().toLowerCase();
    const readFailurePolicy = readRaw === "warn" ? "warn" : "block";

    // Tight timeout — stalled sidecar must not look like a ClawQL outage.
    const timeoutRaw = Number(process.env.CLAWQL_OPENAPPA_TIMEOUT_MS?.trim() || "250");
    const timeoutMs =
      Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.min(timeoutRaw, 5_000) : 250;

    // Brief allow-cache for identical requests (default on).
    const cacheRaw = Number(process.env.CLAWQL_OPENAPPA_ALLOW_CACHE_MS?.trim() || "250");
    const allowCacheMs =
      cacheRaw === 0
        ? 0
        : Number.isFinite(cacheRaw) && cacheRaw > 0
          ? Math.min(cacheRaw, 5_000)
          : 250;

    const failThreshRaw = Number(process.env.CLAWQL_OPENAPPA_CIRCUIT_FAILURES?.trim() || "3");
    const circuitFailureThreshold =
      Number.isFinite(failThreshRaw) && failThreshRaw > 0 ? Math.min(failThreshRaw, 100) : 3;
    const coolRaw = Number(process.env.CLAWQL_OPENAPPA_CIRCUIT_COOLDOWN_MS?.trim() || "2000");
    const circuitCooldownMs =
      Number.isFinite(coolRaw) && coolRaw > 0 ? Math.min(coolRaw, 60_000) : 2000;

    const policyEpoch =
      process.env.CLAWQL_OPENAPPA_POLICY_EPOCH?.trim() ||
      process.env.CLAWQL_OPENAPPA_CONFIG_HASH?.trim() ||
      "default";

    return {
      baseUrl,
      adapter: parseAdapter(process.env.CLAWQL_OPENAPPA_ADAPTER),
      mcpServer: process.env.CLAWQL_OPENAPPA_MCP_SERVER?.trim() || "clawql",
      readFailurePolicy,
      timeoutMs,
      allowCacheMs,
      authTokens,
      isLoopback,
      circuitFailureThreshold,
      circuitCooldownMs,
      policyEpoch,
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

/** Redact secrets from free-text error surfaces (never log tokens). */
export function redactOpenAppaSecretsEffect(
  text: string,
  tokens: readonly string[]
): Effect.Effect<string> {
  return Effect.sync(() => {
    let out = text;
    for (const t of tokens) {
      if (t.length >= 4) out = out.split(t).join("[redacted]");
    }
    out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    return out;
  });
}
