import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { maybeStartGrpcMcpServer, PROTOBUF_MCP_SERVICE_FQN } from "./server.js";
import { MCP_PROTOCOL_VERSION_METADATA_KEY } from "./grpc-mcp-metadata.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const protoRoot = join(__dirname, "../proto");
const wellKnownProtoRoot = dirname(require.resolve("google-proto-files/package.json"));

function loadModelContextProtocolMcpStub() {
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

function createServerWithTool(): McpServer {
  const s = new McpServer({ name: "mcp-protobuf-test", version: "0.0.0" });
  s.tool("hello", "say hi", () => "hi");
  return s;
}

describe("model_context_protocol.Mcp (protobuf RPC surface)", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("ListTools returns UNIMPLEMENTED when mcp-protocol-version metadata is missing", async () => {
    const started = await maybeStartGrpcMcpServer({
      createMcpServer: createServerWithTool,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected server");

    const Mcp = loadModelContextProtocolMcpStub();
    const client = new Mcp(started.address, grpc.credentials.createInsecure());
    const md = new grpc.Metadata();

    try {
      await new Promise<void>((resolve, reject) => {
        client.listTools({ common: {} }, md, (err) => {
          if (!err) {
            reject(new Error("expected error"));
            return;
          }
          expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
          expect(err.details).toContain("Protocol version not provided");
          resolve();
        });
      });
    } finally {
      client.close();
      await started.shutdown();
    }
  });

  it("ListTools succeeds with mcp-protocol-version metadata (parametrized supported versions)", async () => {
    for (const protocolVersion of SUPPORTED_PROTOCOL_VERSIONS) {
      const started = await maybeStartGrpcMcpServer({
        createMcpServer: createServerWithTool,
        bindAddress: "127.0.0.1:0",
      });
      if (!started) throw new Error("expected server");

      const Mcp = loadModelContextProtocolMcpStub();
      const client = new Mcp(started.address, grpc.credentials.createInsecure());
      const md = new grpc.Metadata();
      md.set(MCP_PROTOCOL_VERSION_METADATA_KEY, protocolVersion);

      try {
        const out = await new Promise<{ tools?: { name?: string }[] }>((resolve, reject) => {
          client.listTools({ common: {} }, md, (err, res) => {
            if (err) reject(err);
            else resolve(res as { tools?: { name?: string }[] });
          });
        });
        const names = (out.tools ?? []).map((t) => t.name).sort();
        expect(names).toContain("hello");
      } finally {
        client.close();
        await started.shutdown();
      }
    }
  });

  it("CancelTask returns NOT_FOUND for an unknown task_id", async () => {
    const started = await maybeStartGrpcMcpServer({
      createMcpServer: createServerWithTool,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected server");

    const Mcp = loadModelContextProtocolMcpStub();
    const client = new Mcp(started.address, grpc.credentials.createInsecure());
    const md = new grpc.Metadata();
    md.set(MCP_PROTOCOL_VERSION_METADATA_KEY, SUPPORTED_PROTOCOL_VERSIONS[0]!);

    try {
      await new Promise<void>((resolve, reject) => {
        client.cancelTask({ common: { task_id: randomUUID() } }, md, (err) => {
          if (!err) {
            reject(new Error("expected error"));
            return;
          }
          expect(err.code).toBe(grpc.status.NOT_FOUND);
          resolve();
        });
      });
    } finally {
      client.close();
      await started.shutdown();
    }
  });

  it("grpc.health Check scopes PROTOBUF_MCP_SERVICE_FQN to SERVING", async () => {
    const started = await maybeStartGrpcMcpServer({
      createMcpServer: createServerWithTool,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected server");

    const def = protoLoader.loadSync([join(protoRoot, "grpc/health/v1/health.proto")], {
      includeDirs: [protoRoot],
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(def) as {
      grpc: { health: { v1: { Health: grpc.ServiceClientConstructor } } };
    };
    const Health = pkg.grpc.health.v1.Health;
    const client = new Health(started.address, grpc.credentials.createInsecure());

    try {
      const scoped = await new Promise<{ status?: number | string }>((resolve, reject) => {
        client.check({ service: PROTOBUF_MCP_SERVICE_FQN }, (err, out) => {
          if (err) reject(err);
          else resolve(out as { status?: number | string });
        });
      });
      expect(scoped.status === 1 || scoped.status === "SERVING").toBe(true);
    } finally {
      client.close();
      await started.shutdown();
    }
  });
});
