import type { LoggingLevel } from "@modelcontextprotocol/sdk/types.js";
import { parseResumeData } from "./mcp-protobuf-dependent.js";
import { jsonToStruct, structToJson } from "./mcp-protobuf-struct.js";
import type { McpProtobufBridge } from "./mcp-protobuf-bridge.js";
import { takeLatestProtoLogMessage } from "./mcp-protobuf-logging.js";

/** Parsed `RequestFields` (proto snake_case from `@grpc/proto-loader` with `keepCase: true`). */
export type ParsedRequestCommon = {
  cursor?: string;
  task_id?: string;
  log_level?: string;
  metadata?: Record<string, unknown>;
  /** Filled when retrying the same unary RPC after `dependent_requests` (see `runUnaryWithDependents`). */
  dependent_responses?: Record<string, unknown>;
  /** Optional continuation state (`google.protobuf.Struct` decoded). */
  resume_data?: Record<string, unknown>;
};

export function parseRequestCommon(req: Record<string, unknown>): ParsedRequestCommon {
  const common = req.common as Record<string, unknown> | undefined;
  if (!common) {
    return {};
  }
  const metadata = common.metadata ? structToJson(common.metadata as { fields?: Record<string, unknown> }) : undefined;
  const rawLevel = common.log_level;
  let log_level: string | undefined;
  if (typeof rawLevel === "string" && rawLevel !== "") {
    log_level = rawLevel;
  } else if (typeof rawLevel === "number") {
    const byNum: Record<number, string> = {
      1: "LOG_LEVEL_DEBUG",
      2: "LOG_LEVEL_INFO",
      3: "LOG_LEVEL_NOTICE",
      4: "LOG_LEVEL_WARNING",
      5: "LOG_LEVEL_ERROR",
      6: "LOG_LEVEL_CRITICAL",
      7: "LOG_LEVEL_ALERT",
      8: "LOG_LEVEL_EMERGENCY",
    };
    log_level = byNum[rawLevel];
  }
  const dep = common.dependent_responses;
  return {
    cursor: typeof common.cursor === "string" && common.cursor !== "" ? common.cursor : undefined,
    task_id: typeof common.task_id === "string" && common.task_id !== "" ? common.task_id : undefined,
    log_level,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    dependent_responses:
      dep && typeof dep === "object" && !Array.isArray(dep) ? (dep as Record<string, unknown>) : undefined,
    resume_data: parseResumeData(common),
  };
}

export function listParamsFromCommon(parsed: ParsedRequestCommon): { cursor?: string; _meta?: Record<string, unknown> } | undefined {
  const p: { cursor?: string; _meta?: Record<string, unknown> } = {};
  if (parsed.cursor) {
    p.cursor = parsed.cursor;
  }
  if (parsed.metadata) {
    p._meta = parsed.metadata;
  }
  return Object.keys(p).length > 0 ? p : undefined;
}

/** Map protobuf `LogLevel` enum string → MCP `logging/setLevel` level. */
export function protoLogLevelToMcp(level: string | undefined): LoggingLevel | undefined {
  if (!level) {
    return undefined;
  }
  const m: Record<string, LoggingLevel> = {
    LOG_LEVEL_DEBUG: "debug",
    LOG_LEVEL_INFO: "info",
    LOG_LEVEL_NOTICE: "notice",
    LOG_LEVEL_WARNING: "warning",
    LOG_LEVEL_ERROR: "error",
    LOG_LEVEL_CRITICAL: "critical",
    LOG_LEVEL_ALERT: "alert",
    LOG_LEVEL_EMERGENCY: "emergency",
  };
  return m[level];
}

type SdkResultWithMeta = {
  nextCursor?: string;
  _meta?: Record<string, unknown>;
};

/** Build protobuf `ResponseFields` (`common`) from SDK list/read results + optional instructions. */
export function buildResponseCommon(
  bridge: McpProtobufBridge,
  sdk: SdkResultWithMeta | undefined,
  options?: { includeLog?: boolean }
): Record<string, unknown> {
  const common: Record<string, unknown> = {};
  const instructions = bridge.getInstructions();
  if (instructions) {
    common.instructions = instructions;
  }
  if (sdk?.nextCursor) {
    common.next_cursor = sdk.nextCursor;
  }
  if (sdk?._meta && Object.keys(sdk._meta).length > 0) {
    common.metadata = jsonToStruct(sdk._meta);
  }
  if (options?.includeLog !== false) {
    const log = takeLatestProtoLogMessage();
    if (log) {
      common.log_message = log;
    }
  }
  return common;
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof Error && e.name === "AbortError") {
    return true;
  }
  if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") {
    return true;
  }
  return false;
}
