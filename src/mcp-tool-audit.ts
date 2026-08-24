/**
 * Automatic MCP `audit.append` for every registered tool call except `audit` itself
 * (avoids recursion). Failures never fail the original tool.
 */

import { Effect } from "effect";
import { handleAuditToolInput } from "./clawql-audit.js";

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|api[_-]?key|authorization|bearer|cookie|private[_-]?key)$/i;

export type McpToolAuditOutcome = "ok" | "error" | "blocked" | "payment_required" | "thrown";

export type McpToolAuditEvent = {
  readonly toolName: string;
  readonly args: unknown;
  readonly outcome: McpToolAuditOutcome;
  readonly result?: unknown;
  readonly errorMessage?: string;
};

function envFlagOff(raw: string | undefined): boolean {
  const t = raw?.trim().toLowerCase();
  return t === "0" || t === "false" || t === "no";
}

/** Default on; set **`CLAWQL_AUDIT_TOOL_CALLS=0`** to opt out. */
export const isMcpToolCallAuditEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => !envFlagOff(env.CLAWQL_AUDIT_TOOL_CALLS));

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[…]";
  if (value == null) return value;
  if (typeof value === "string") return truncate(value, 120);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function resultSnippet(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const rec = result as { isError?: unknown; content?: unknown };
  const err = rec.isError === true ? " isError=true" : "";
  const content = rec.content;
  if (!Array.isArray(content) || content.length === 0) return err;
  const first = content[0] as { text?: unknown };
  const text = typeof first?.text === "string" ? first.text : "";
  return `${err} resultChars=${text.length}`;
}

export function summarizeMcpToolArgs(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  switch (toolName) {
    case "memory_ingest":
      return `title=${truncate(asString(a.title), 80)} append=${a.append ?? ""} insightsChars=${asString(a.insights).length}`;
    case "memory_recall":
      return `query=${truncate(asString(a.query), 80)} limit=${a.limit ?? ""} maxDepth=${a.maxDepth ?? ""}`;
    case "search":
      return `query=${truncate(asString(a.query), 80)}`;
    case "execute":
      return `operationId=${truncate(asString(a.operationId), 80)} dry_run=${a.dry_run ?? a.dryRun ?? ""}`;
    case "data_query":
    case "clawql_sql":
      return `sqlChars=${asString(a.sql ?? a.query).length}`;
    case "web_search":
      return `query=${truncate(asString(a.query), 80)}`;
    case "cache":
      return `operation=${asString(a.operation)} key=${truncate(asString(a.key), 80)}`;
    default: {
      try {
        return truncate(JSON.stringify(redactValue(a, 0)), 400);
      } catch {
        return "args=unserializable";
      }
    }
  }
}

function correlationIdFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const c = (args as { correlationId?: unknown }).correlationId;
  if (typeof c !== "string") return undefined;
  const t = c.trim();
  return t ? truncate(t, 128) : undefined;
}

export const buildMcpToolAuditAppend = (
  event: McpToolAuditEvent
): Effect.Effect<{
  operation: "append";
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
} | null> =>
  Effect.gen(function* () {
    const enabled = yield* isMcpToolCallAuditEnabled();
    if (!enabled) return null;
    const toolName = event.toolName.trim();
    if (!toolName || toolName === "audit") return null;

    const argsPart = summarizeMcpToolArgs(toolName, event.args);
    const errPart = event.errorMessage ? ` error=${truncate(event.errorMessage, 80)}` : "";
    const resultPart = resultSnippet(event.result);
    const summary = truncate(
      `${event.outcome} ${argsPart}${resultPart}${errPart}`.trim(),
      512
    );
    const correlationId = correlationIdFromArgs(event.args);
    return {
      operation: "append" as const,
      category: "mcp_tool",
      action: truncate(toolName, 128),
      summary: summary || event.outcome,
      ...(correlationId ? { correlationId } : {}),
    };
  });

export const recordMcpToolCallAuditEffect = (event: McpToolAuditEvent): Effect.Effect<void> =>
  Effect.gen(function* () {
    const params = yield* buildMcpToolAuditAppend(event);
    if (!params) return;
    yield* Effect.tryPromise({
      try: async () => {
        await handleAuditToolInput(params);
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error("[clawql-mcp-tool-audit] append failed:", err.message);
        })
      )
    );
  });

/** MCP host façade — never throws. */
export async function recordMcpToolCallAudit(event: McpToolAuditEvent): Promise<void> {
  await Effect.runPromise(recordMcpToolCallAuditEffect(event));
}
