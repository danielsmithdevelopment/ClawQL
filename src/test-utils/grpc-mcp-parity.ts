/**
 * Shared gRPC MCP ListTools / CallTool helpers for optional-tool parity tests.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import protobuf from "protobufjs";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { createRegisteredMcpServer } from "../mcp/mcp-server-factory.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const protoRoot = join(root, "packages/mcp-grpc-transport/proto");

export const GRPC_PARITY_MINIMAL_SPEC = join(here, "fixtures", "minimal-petstore.json");

const CALL_TOOL = "/model_context_protocol.Mcp/CallTool";

type StructFields = Record<
  string,
  { stringValue?: string; numberValue?: number; boolValue?: boolean }
>;

function argsToStructFields(args: Record<string, unknown>): StructFields {
  const fields: StructFields = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    if (typeof v === "string") fields[k] = { stringValue: v };
    else if (typeof v === "number" && Number.isFinite(v)) fields[k] = { numberValue: v };
    else if (typeof v === "boolean") fields[k] = { boolValue: v };
  }
  return fields;
}

export function loadMcpClientConstructor(): grpc.ServiceClientConstructor {
  const require = createRequire(import.meta.url);
  const grpcWorkspaceRoot = join(root, "packages/mcp-grpc-transport");
  const wellKnownProtoRoot = dirname(
    require.resolve("google-proto-files/package.json", { paths: [grpcWorkspaceRoot] })
  );
  const def = protoLoader.loadSync([join(protoRoot, "model_context_protocol/mcp.proto")], {
    includeDirs: [protoRoot, wellKnownProtoRoot],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(def) as {
    model_context_protocol: { Mcp: grpc.ServiceClientConstructor };
  };
  return loaded.model_context_protocol.Mcp;
}

/** Start an ephemeral gRPC MCP server, ListTools, then shut down. */
export async function listToolNamesFromEphemeralGrpcServer(): Promise<Set<string>> {
  const started = await maybeStartGrpcMcpServer({
    createMcpServer: createRegisteredMcpServer,
    bindAddress: "127.0.0.1:0",
  });
  if (!started) throw new Error("expected gRPC server");

  const Mcp = loadMcpClientConstructor();
  const client = new Mcp(started.address, grpc.credentials.createInsecure());
  const md = new grpc.Metadata();
  md.set("mcp-protocol-version", SUPPORTED_PROTOCOL_VERSIONS[0]!);

  try {
    const out = await new Promise<{ tools?: { name?: string }[] }>((resolve, reject) => {
      client.listTools({ common: {} }, md, (err, res) => {
        if (err) reject(err);
        else resolve(res as { tools?: { name?: string }[] });
      });
    });
    return new Set((out.tools ?? []).map((t) => t.name).filter((n): n is string => Boolean(n)));
  } finally {
    client.close();
    await started.shutdown();
  }
}

async function loadCallToolTypes(): Promise<{
  CallToolRequest: protobuf.Type;
  CallToolResponse: protobuf.Type;
}> {
  const require = createRequire(import.meta.url);
  const grpcWorkspaceRoot = join(root, "packages/mcp-grpc-transport");
  const wellKnown = dirname(
    require.resolve("google-proto-files", {
      paths: [grpcWorkspaceRoot],
    })
  );
  const pbRoot = new protobuf.Root();
  await pbRoot.load(join(protoRoot, "model_context_protocol/mcp.proto"), {
    keepCase: true,
    includeDirs: [protoRoot, wellKnown],
  });
  return {
    CallToolRequest: pbRoot.lookupType("model_context_protocol.CallToolRequest"),
    CallToolResponse: pbRoot.lookupType("model_context_protocol.CallToolResponse"),
  };
}

export function lastNonEmptyToolText(messages: Record<string, unknown>[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content as Array<{ text?: { text?: string } }> | undefined;
    if (!content?.length) continue;
    const t = content[0]?.text?.text;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return "";
}

/** CallTool over protobuf Struct args against a running gRPC MCP address. */
export async function callToolGrpc(
  address: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const { CallToolRequest, CallToolResponse } = await loadCallToolTypes();
  const payload = {
    common: {},
    request: {
      name: toolName,
      arguments: { fields: argsToStructFields(args) },
    },
  };
  const verr = CallToolRequest.verify(payload);
  if (verr) throw new Error(String(verr));

  const client = new grpc.Client(address, grpc.credentials.createInsecure());
  await new Promise<void>((resolve, reject) => {
    client.waitForReady(Date.now() + 15_000, (e) => (e ? reject(e) : resolve()));
  });
  const md = new grpc.Metadata();
  md.set("mcp-protocol-version", SUPPORTED_PROTOCOL_VERSIONS[0]!);

  const serialize = (req: object) =>
    Buffer.from(CallToolRequest.encode(CallToolRequest.create(req)).finish());
  const deserialize = (buf: Buffer) => CallToolResponse.decode(buf);

  const stream = client.makeServerStreamRequest(CALL_TOOL, serialize, deserialize, payload, md);

  const decoded: protobuf.Message[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (msg: protobuf.Message) => decoded.push(msg));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  client.close();

  return decoded.map((msg) =>
    CallToolResponse.toObject(msg, { defaults: true, enums: String, longs: String })
  ) as Record<string, unknown>[];
}

/** Start ephemeral gRPC MCP, CallTool once, shut down; returns last non-empty text. */
export async function callToolOnEphemeralGrpcServer(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const started = await maybeStartGrpcMcpServer({
    createMcpServer: createRegisteredMcpServer,
    bindAddress: "127.0.0.1:0",
  });
  if (!started) throw new Error("expected gRPC server");
  try {
    const messages = await callToolGrpc(started.address, toolName, args);
    return lastNonEmptyToolText(messages);
  } finally {
    await started.shutdown();
  }
}
