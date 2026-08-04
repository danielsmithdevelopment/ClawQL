/**
 * Client helper: `model_context_protocol.Mcp/CallTool` with protobufjs encoding so nested
 * `google.protobuf.Struct` / `Value` survive the wire (same rationale as `scripts/dev/grpc-memory-recall.mjs`).
 *
 * Use this for **large** tool arguments (e.g. `execute` with base64 PDF bodies). Streamable HTTP JSON-RPC
 * is convenient for agents but carries smaller practical body limits than gRPC protobuf frames.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";
import { LATEST_PROTOCOL_VERSION } from "./protocol-versions.js";
import { jsonToStruct } from "./mcp-protobuf-struct.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = join(__dirname, "../proto");
const CALL_TOOL_METHOD = "/model_context_protocol.Mcp/CallTool";

export type CallToolGrpcClientOptions = {
  /** Host:port, e.g. `127.0.0.1:50051`. */
  address: string;
  toolName: string;
  /** Plain JSON-shaped tool arguments (nested objects/arrays supported). */
  arguments: Record<string, unknown>;
  /** Defaults to {@link LATEST_PROTOCOL_VERSION}. */
  protocolVersion?: string;
  credentials?: grpc.ChannelCredentials;
  /** gRPC `waitForReady` budget (ms). */
  readyDeadlineMs?: number;
  /** Max send/receive message length for this client channel (bytes). */
  maxMessageLength?: number;
};

/** Resolve default max message size (bytes) for gRPC client channels. */
export function resolveGrpcMaxMessageLengthFromEnv(): number {
  const raw = process.env.GRPC_MAX_MESSAGE_LENGTH?.trim();
  if (!raw) return 64 * 1024 * 1024;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 64 * 1024 * 1024;
}

/**
 * Convert MCP-style JSON args → `google.protobuf.Struct.fields` shape expected by
 * `protobufjs` + `CallToolRequest.fromObject` (camelCase Value discriminators).
 */
export function mcpArgumentsToCallToolStructFields(
  args: Record<string, unknown>
): Record<string, unknown> {
  const { fields } = jsonToStruct(args);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) {
    out[k] = mcpValueToProtobufJs(val as Record<string, unknown>);
  }
  return out;
}

function mcpValueToProtobufJs(v: Record<string, unknown>): Record<string, unknown> {
  if ("null_value" in v || "nullValue" in v) {
    return { nullValue: (v.null_value ?? v.nullValue ?? 0) as number };
  }
  if ("string_value" in v || "stringValue" in v) {
    return { stringValue: String(v.string_value ?? v.stringValue ?? "") };
  }
  if ("number_value" in v || "numberValue" in v) {
    return { numberValue: Number(v.number_value ?? v.numberValue ?? 0) };
  }
  if ("bool_value" in v || "boolValue" in v) {
    return { boolValue: Boolean(v.bool_value ?? v.boolValue) };
  }
  const structInner = (v.struct_value ?? v.structValue) as
    { fields?: Record<string, Record<string, unknown>> } | undefined;
  if (structInner && typeof structInner === "object" && structInner.fields) {
    const inner: Record<string, unknown> = {};
    for (const [k2, v2] of Object.entries(structInner.fields)) {
      inner[k2] = mcpValueToProtobufJs(v2);
    }
    return { structValue: { fields: inner } };
  }
  const listInner = (v.list_value ?? v.listValue) as { values?: unknown[] } | undefined;
  if (listInner && Array.isArray(listInner.values)) {
    return {
      listValue: {
        values: listInner.values.map((x) =>
          mcpValueToProtobufJs((x as Record<string, unknown>) ?? {})
        ),
      },
    };
  }
  return { stringValue: JSON.stringify(v) };
}

async function loadCallToolTypes(): Promise<{
  CallToolRequest: protobuf.Type;
  CallToolResponse: protobuf.Type;
}> {
  const packageRoot = join(__dirname, "..");
  const require = createRequire(import.meta.url);
  const wellKnown = dirname(
    require.resolve("google-proto-files/package.json", { paths: [packageRoot] })
  );
  const root = new protobuf.Root();
  root.resolvePath = (origin: string | undefined, target: string) => {
    if (target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target)) {
      return target;
    }
    if (target.startsWith("google/")) {
      return join(wellKnown, target);
    }
    const base = origin && origin.length > 0 ? dirname(origin) : protoRoot;
    return join(base, target);
  };
  await root.load(join(protoRoot, "model_context_protocol/mcp.proto"), { keepCase: true });
  return {
    CallToolRequest: root.lookupType("model_context_protocol.CallToolRequest"),
    CallToolResponse: root.lookupType("model_context_protocol.CallToolResponse"),
  };
}

/**
 * Invoke `CallTool` over gRPC (server-streaming). Returns decoded `CallToolResponse` objects as plain maps.
 */
export async function callToolServerStreamingGrpc(
  options: CallToolGrpcClientOptions
): Promise<Record<string, unknown>[]> {
  const { CallToolRequest, CallToolResponse } = await loadCallToolTypes();
  const fields = mcpArgumentsToCallToolStructFields(options.arguments);
  const payload = {
    common: {},
    request: {
      name: options.toolName,
      arguments: { fields },
    },
  };
  const verr = CallToolRequest.verify(payload);
  if (verr) throw new Error(`CallToolRequest.verify: ${verr}`);

  const encodedRequest = Buffer.from(
    CallToolRequest.encode(CallToolRequest.create(payload)).finish()
  );

  const creds = options.credentials ?? grpc.credentials.createInsecure();
  const maxLen = options.maxMessageLength ?? resolveGrpcMaxMessageLengthFromEnv();
  const client = new grpc.Client(options.address, creds, {
    "grpc.max_receive_message_length": maxLen,
    "grpc.max_send_message_length": maxLen,
  });

  await new Promise<void>((resolve, reject) => {
    client.waitForReady(Date.now() + (options.readyDeadlineMs ?? 15_000), (e) =>
      e ? reject(e) : resolve()
    );
  });

  const md = new grpc.Metadata();
  md.set("mcp-protocol-version", options.protocolVersion?.trim() || LATEST_PROTOCOL_VERSION);

  const serialize = () => encodedRequest;
  const deserialize = (buf: Buffer) => CallToolResponse.decode(buf);

  const decoded: protobuf.Message[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = client.makeServerStreamRequest(CALL_TOOL_METHOD, serialize, deserialize, {}, md);
    stream.on("data", (msg: protobuf.Message) => decoded.push(msg));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  client.close();

  return decoded.map((msg) =>
    CallToolResponse.toObject(msg, { defaults: true, enums: String, longs: String })
  ) as Record<string, unknown>[];
}

/** Last non-empty text block from streamed CallTool responses (typical ClawQL `execute` shape). */
export function lastNonEmptyCallToolText(messages: Record<string, unknown>[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content as Array<{ text?: { text?: string } }> | undefined;
    if (!content?.length) continue;
    const t = content[0]?.text?.text;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return "";
}

/**
 * Resolve gRPC `host:port` from env for scripts/agents:
 * - **`CLAWQL_MCP_GRPC_ADDR`** (e.g. `127.0.0.1:50051`)
 * - else **`GRPC_HOST`** + **`GRPC_PORT`** (port default `50051`)
 */
export function resolveGrpcAddressFromEnv(): string {
  const single = process.env.CLAWQL_MCP_GRPC_ADDR?.trim();
  if (single) return single;
  const host = process.env.GRPC_HOST?.trim();
  if (host) {
    const port = process.env.GRPC_PORT?.trim() || "50051";
    return `${host}:${port}`;
  }
  return `127.0.0.1:${process.env.GRPC_PORT?.trim() || "50051"}`;
}
