import { Effect } from "effect";
import type { OpenAppaAdapter } from "./types.js";

export type OpenAppaConfig = {
  readonly baseUrl: string;
  readonly adapter: OpenAppaAdapter;
  /** MCP server segment in `mcp__<server>__<tool>` wire spelling. */
  readonly mcpServer: string;
  readonly failurePolicy: "block" | "warn";
  readonly timeoutMs: number;
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

export function loadOpenAppaConfigEffect(): Effect.Effect<OpenAppaConfig | null> {
  return Effect.gen(function* () {
    const enabled = yield* openAppaEnabledEffect();
    if (!enabled) return null;
    const baseUrl = (
      process.env.CLAWQL_OPENAPPA_URL?.trim() || "http://127.0.0.1:8789"
    ).replace(/\/$/, "");
    const failureRaw = process.env.CLAWQL_OPENAPPA_FAILURE_POLICY?.trim().toLowerCase();
    const failurePolicy = failureRaw === "warn" ? "warn" : "block";
    const timeoutRaw = Number(process.env.CLAWQL_OPENAPPA_TIMEOUT_MS?.trim() || "5000");
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 5000;
    return {
      baseUrl,
      adapter: parseAdapter(process.env.CLAWQL_OPENAPPA_ADAPTER),
      mcpServer: process.env.CLAWQL_OPENAPPA_MCP_SERVER?.trim() || "clawql",
      failurePolicy,
      timeoutMs,
    } satisfies OpenAppaConfig;
  });
}

export function loadOpenAppaConfig(): OpenAppaConfig | null {
  return Effect.runSync(loadOpenAppaConfigEffect());
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
