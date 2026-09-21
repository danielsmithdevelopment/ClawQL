/**
 * Shared gRPC MCP ListTools helpers for optional-tool parity tests.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { createRegisteredMcpServer } from "../mcp/mcp-server-factory.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const protoRoot = join(root, "packages/mcp-grpc-transport/proto");

export const GRPC_PARITY_MINIMAL_SPEC = join(here, "fixtures", "minimal-petstore.json");

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
