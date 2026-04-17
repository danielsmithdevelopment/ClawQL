import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maybeStartGrpcMcpServer, MCP_TRANSPORT_SESSION_SERVICE_FQN } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = join(__dirname, "../proto");
const tlsDir = join(__dirname, "../test-fixtures/tls");

function minimalMcpServer(): McpServer {
  return new McpServer({ name: "mcp-grpc-transport-test", version: "0.0.0" });
}

describe("maybeStartGrpcMcpServer", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    delete process.env.GRPC_TLS_CERT_PATH;
    delete process.env.GRPC_TLS_KEY_PATH;
    delete process.env.GRPC_TLS_CA_PATH;
    delete process.env.GRPC_TLS_REQUIRE_CLIENT_CERT;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns undefined when ENABLE_GRPC is unset", async () => {
    delete process.env.ENABLE_GRPC;
    const s = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    expect(s).toBeUndefined();
  });

  it("exposes grpc.health.v1.Health/Check (overall)", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    expect(started).toBeDefined();
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
    const Client = pkg.grpc.health.v1.Health;
    const client = new Client(started.address, grpc.credentials.createInsecure());

    try {
      const res = await new Promise<{ status?: number | string }>((resolve, reject) => {
        client.check({ service: "" }, (err, out) => {
          if (err) reject(err);
          else resolve(out as { status?: number | string });
        });
      });
      expect(res.status === 1 || res.status === "SERVING").toBe(true);
    } finally {
      client.close();
      await started.shutdown();
    }
  });

  it("Health/Check scoped to MCP session service name", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
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
    const Client = pkg.grpc.health.v1.Health;
    const client = new Client(started.address, grpc.credentials.createInsecure());

    try {
      const scoped = await new Promise<{ status?: number | string }>((resolve, reject) => {
        client.check({ service: MCP_TRANSPORT_SESSION_SERVICE_FQN }, (err, out) => {
          if (err) reject(err);
          else resolve(out as { status?: number | string });
        });
      });
      expect(scoped.status === 1 || scoped.status === "SERVING").toBe(true);

      const unknown = await new Promise<{ status?: number | string }>((resolve, reject) => {
        client.check({ service: "unknown.vendor.Service" }, (err, out) => {
          if (err) reject(err);
          else resolve(out as { status?: number | string });
        });
      });
      expect(unknown.status === 3 || unknown.status === "SERVICE_UNKNOWN").toBe(true);
    } finally {
      client.close();
      await started.shutdown();
    }
  });

  it("Health/Watch emits SERVING then ends on cancel", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
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
    const Client = pkg.grpc.health.v1.Health;
    const client = new Client(started.address, grpc.credentials.createInsecure());

    try {
      await new Promise<void>((resolve, reject) => {
        const call = client.watch({ service: "" });
        let got = false;
        call.on("data", (msg: { status?: number | string }) => {
          if (!got) {
            got = true;
            expect(msg.status === 1 || msg.status === "SERVING").toBe(true);
            call.cancel();
          }
        });
        call.on("error", (e: grpc.ServiceError) => {
          if (e.code === grpc.status.CANCELLED) resolve();
          else reject(e);
        });
        call.on("end", () => resolve());
      });
    } finally {
      client.close();
      await started.shutdown();
    }
  });

  it("serves MCP Session over TLS (self-signed test cert)", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    process.env.GRPC_TLS_CERT_PATH = join(tlsDir, "server.crt");
    process.env.GRPC_TLS_KEY_PATH = join(tlsDir, "server.key");

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected server");

    const def = protoLoader.loadSync([join(protoRoot, "mcp/transport/v1/mcp.proto")], {
      includeDirs: [protoRoot],
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const root = readFileSync(join(tlsDir, "server.crt"));
    const creds = grpc.credentials.createSsl(root);
    const pkg = grpc.loadPackageDefinition(def) as {
      mcp: { transport: { v1: { Mcp: grpc.ServiceClientConstructor } } };
    };
    const Client = pkg.mcp.transport.v1.Mcp;
    // TLS SNI must not be a bare IP; cert is issued for localhost.
    const connectTarget = started.address.replace(/^127\.0\.0\.1:/, "localhost:");
    const mcpClient = new Client(connectTarget, creds);
    const call = mcpClient.session();

    const initLine = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "tls-test", version: "0.0.0" },
      },
    });

    try {
      const first = await new Promise<{ result?: unknown; id?: number }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 10_000);
        call.on("data", (msg: { line?: string }) => {
          try {
            const line = msg?.line;
            if (!line) return;
            const j = JSON.parse(line) as { result?: unknown; id?: number; error?: unknown };
            if (j.id === 1) {
              clearTimeout(t);
              resolve(j);
            }
          } catch (e) {
            clearTimeout(t);
            reject(e);
          }
        });
        call.on("error", (e) => {
          clearTimeout(t);
          reject(e);
        });
        call.write({ line: initLine });
      });
      expect(first.error).toBeUndefined();
      expect(first.result).toBeDefined();
    } finally {
      call.end();
      mcpClient.close();
      await started.shutdown();
    }
  });

  it("registers reflection when ENABLE_GRPC_REFLECTION=1", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "1";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    expect(started?.reflectionEnabled).toBe(true);
    if (started) await started.shutdown();
  });

  it("accepts grpc.ServerOptions (channel limits / OTel hooks use the same object)", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
      bindAddress: "127.0.0.1:0",
      grpcServerOptions: {
        "grpc.max_receive_message_length": 8 * 1024 * 1024,
      },
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
    const Client = pkg.grpc.health.v1.Health;
    const client = new Client(started.address, grpc.credentials.createInsecure());
    try {
      await new Promise<void>((resolve, reject) => {
        client.check({ service: "" }, (err) => (err ? reject(err) : resolve()));
      });
    } finally {
      client.close();
      await started.shutdown();
    }
  });

  it("Session: initialize, notifications/initialized, ping", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    const started = await maybeStartGrpcMcpServer({
      createMcpServer: minimalMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected server");

    const def = protoLoader.loadSync([join(protoRoot, "mcp/transport/v1/mcp.proto")], {
      includeDirs: [protoRoot],
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(def) as {
      mcp: { transport: { v1: { Mcp: grpc.ServiceClientConstructor } } };
    };
    const Client = pkg.mcp.transport.v1.Mcp;
    const mcpClient = new Client(started.address, grpc.credentials.createInsecure());
    const call = mcpClient.session();

    const initLine = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "flow-test", version: "0.0.0" },
      },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 15_000);
        call.on("data", (msg: { line?: string }) => {
          try {
            const line = msg?.line;
            if (!line) return;
            const j = JSON.parse(line) as { id?: number; result?: unknown };
            if (j.id === 1 && j.result) {
              call.write({
                line: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
              });
              // `ping` is always handled by the SDK; `tools/list` needs a registered tool on McpServer.
              call.write({
                line: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "ping",
                }),
              });
            }
            if (j.id === 2 && j.result !== undefined) {
              clearTimeout(t);
              expect(j.result).toBeDefined();
              resolve();
            }
          } catch (e) {
            clearTimeout(t);
            reject(e);
          }
        });
        call.on("error", (e) => {
          clearTimeout(t);
          reject(e);
        });
        call.write({ line: initLine });
      });
    } finally {
      call.end();
      mcpClient.close();
      await started.shutdown();
    }
  });
});
