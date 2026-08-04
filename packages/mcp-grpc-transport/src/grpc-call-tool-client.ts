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
import { jsonToStruct, structToJson } from "./mcp-protobuf-struct.js";
import { MCP_PROTOCOL_VERSION_METADATA_KEY } from "./grpc-mcp-metadata.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = join(__dirname, "../proto");
const CALL_TOOL_METHOD = "/model_context_protocol.Mcp/CallTool";
const require = createRequire(import.meta.url);

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
 * Convert MCP-style JSON args → `google.protobuf.Struct.fields` for
 * `protobufjs` + `CallToolRequest` (camelCase Value oneofs).
 */
export function mcpArgumentsToCallToolStructFields(
  args: Record<string, unknown>
): Record<string, unknown> {
  return jsonToStruct(args).fields;
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

export type ListedMcpTool = {
  name: string;
  description?: string;
  title?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

export type ListToolsGrpcClientOptions = {
  address: string;
  protocolVersion?: string;
  credentials?: grpc.ChannelCredentials;
  readyDeadlineMs?: number;
  maxMessageLength?: number;
};

const LIST_TOOLS_METHOD = "/model_context_protocol.Mcp/ListTools";

async function loadListToolsTypes(): Promise<{
  ListToolsRequest: protobuf.Type;
  ListToolsResponse: protobuf.Type;
}> {
  const packageRoot = join(__dirname, "..");
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
    ListToolsRequest: root.lookupType("model_context_protocol.ListToolsRequest"),
    ListToolsResponse: root.lookupType("model_context_protocol.ListToolsResponse"),
  };
}

/**
 * Invoke unary `ListTools` over gRPC and decode `input_schema` / `output_schema` Structs to JSON Schema objects.
 *
 * Uses protobufjs decode (not `@grpc/proto-loader` message objects) so nested
 * `google.protobuf.Value` fields inside Struct survive the wire.
 */
export async function listToolsUnaryGrpc(
  options: ListToolsGrpcClientOptions
): Promise<ListedMcpTool[]> {
  const { ListToolsRequest, ListToolsResponse } = await loadListToolsTypes();
  const payload = { common: {} };
  const encodedRequest = Buffer.from(
    ListToolsRequest.encode(ListToolsRequest.create(payload)).finish()
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
  md.set(
    MCP_PROTOCOL_VERSION_METADATA_KEY,
    options.protocolVersion?.trim() || LATEST_PROTOCOL_VERSION
  );

  try {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      client.makeUnaryRequest(
        LIST_TOOLS_METHOD,
        () => encodedRequest,
        (b: Buffer) => b,
        {},
        md,
        (err, response) => {
          if (err) reject(err);
          else resolve(response as Buffer);
        }
      );
    });

    const decoded = ListToolsResponse.decode(buf);
    const obj = ListToolsResponse.toObject(decoded, {
      defaults: true,
      enums: String,
      longs: String,
      // Keep oneof Value discriminators for structToJson
      json: false,
    }) as {
      tools?: Array<{
        name?: string;
        description?: string;
        title?: string;
        input_schema?: { fields?: Record<string, unknown> | Map<string, unknown> };
        inputSchema?: { fields?: Record<string, unknown> | Map<string, unknown> };
        output_schema?: { fields?: Record<string, unknown> | Map<string, unknown> };
        outputSchema?: { fields?: Record<string, unknown> | Map<string, unknown> };
      }>;
    };

    return (obj.tools ?? [])
      .filter((t) => typeof t.name === "string" && t.name.length > 0)
      .map((t) => {
        const inputSchema = structToJson(t.input_schema ?? t.inputSchema) ?? {
          type: "object",
          properties: {},
        };
        const outputSchema = structToJson(t.output_schema ?? t.outputSchema);
        const tool: ListedMcpTool = {
          name: t.name!,
          inputSchema,
        };
        if (typeof t.description === "string" && t.description.length > 0) {
          tool.description = t.description;
        }
        if (typeof t.title === "string" && t.title.length > 0) {
          tool.title = t.title;
        }
        if (outputSchema && Object.keys(outputSchema).length > 0) {
          tool.outputSchema = outputSchema;
        }
        return tool;
      });
  } finally {
    client.close();
  }
}
