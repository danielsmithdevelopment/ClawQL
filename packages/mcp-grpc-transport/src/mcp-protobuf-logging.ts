import { AsyncLocalStorage } from "node:async_hooks";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { jsonToValue } from "./mcp-protobuf-struct.js";

export type RpcLogBuffer = { logs: Array<{ level: string; logger?: string; data: unknown }> };

/** Per-RPC capture of `notifications/message` for bridging into protobuf `ResponseFields.log_message`. */
export const protobufRpcLogStorage = new AsyncLocalStorage<RpcLogBuffer>();

/** Install once per connected SDK client so server log lines can be attached to unary/stream responses. */
export function installProtobufClientLogging(client: Client): void {
  client.setNotificationHandler(LoggingMessageNotificationSchema, (n) => {
    const store = protobufRpcLogStorage.getStore();
    if (!store) {
      return;
    }
    store.logs.push({
      level: n.params.level,
      logger: n.params.logger,
      data: n.params.data,
    });
  });
}

/** Map MCP logging level string to protobuf `LogLevel` enum (proto-loader `enums: String` names). */
export function mcpLevelToProtoLogLevel(level: string): string {
  const m: Record<string, string> = {
    debug: "LOG_LEVEL_DEBUG",
    info: "LOG_LEVEL_INFO",
    notice: "LOG_LEVEL_NOTICE",
    warning: "LOG_LEVEL_WARNING",
    error: "LOG_LEVEL_ERROR",
    critical: "LOG_LEVEL_CRITICAL",
    alert: "LOG_LEVEL_ALERT",
    emergency: "LOG_LEVEL_EMERGENCY",
  };
  return m[level] ?? "LOG_LEVEL_UNKNOWN";
}

/** Latest log as protobuf `LogMessage` shape, or undefined. */
export function takeLatestProtoLogMessage(): Record<string, unknown> | undefined {
  const store = protobufRpcLogStorage.getStore();
  const last = store?.logs.at(-1);
  if (!last) {
    return undefined;
  }
  return {
    log_level: mcpLevelToProtoLogLevel(last.level),
    logger: last.logger ?? "",
    data: jsonToValue(last.data === undefined ? null : last.data),
  };
}
