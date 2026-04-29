/**
 * clawql-mcp-http exposes JSON GET /healthz and OpenMetrics GET /metrics on the HTTP listener.
 * The companion gRPC server (ENABLE_GRPC) exposes grpc.health.v1.Health only — no HTTP /metrics
 * on the gRPC port. This file locks that contract so operators know what to scrape per transport.
 */

import { createServer, type Server } from "node:http";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { createMcpHttpApp } from "./server-http.js";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { resetSpecCache } from "./spec-loader.js";
import { resetSchemaFieldCache } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");
const grpcProtoRoot = join(root, "packages/mcp-grpc-transport/proto");

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function grpcHealthCheck(address: string, service: string): Promise<{ status?: number | string }> {
  const def = protoLoader.loadSync([join(grpcProtoRoot, "grpc/health/v1/health.proto")], {
    includeDirs: [grpcProtoRoot],
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
  const client = new Client(address, grpc.credentials.createInsecure());
  return new Promise((resolve, reject) => {
    client.check({ service }, (err, out) => {
      client.close();
      if (err) reject(err);
      else resolve(out as { status?: number | string });
    });
  });
}

/** Raw HTTP/1.1 GET (gRPC-js is not an HTTP Prometheus server). */
function rawHttpGet(
  host: string,
  port: number,
  path: string,
  ms: number
): Promise<{
  statusCode?: number;
  raw: string;
  error?: NodeJS.ErrnoException;
}> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host, port, path, method: "GET", headers: { Connection: "close" }, timeout: ms },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, raw });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ raw: "", error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) });
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      resolve({ raw: "", error });
    });
    req.end();
  });
}

describe("HTTP vs gRPC observability surface (parity contract)", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-parity-"));
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    delete process.env.CLAWQL_DISABLE_HTTP_METRICS;
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it("HTTP /healthz is ok and gRPC Health/Check is SERVING for the same MCP registration", async () => {
    const app = await createMcpHttpApp({ mcpPath: "/mcp" });
    const httpSrv = createServer(app);
    httpSrv.listen(0, "127.0.0.1");
    await once(httpSrv, "listening");
    const httpAddr = httpSrv.address();
    if (!httpAddr || typeof httpAddr === "string") throw new Error("http bind");
    const httpBase = `http://127.0.0.1:${httpAddr.port}`;

    const grpcStarted = await maybeStartGrpcMcpServer({
      createMcpServer: createRegisteredMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!grpcStarted) throw new Error("expected gRPC server");

    try {
      const hz = await fetch(`${httpBase}/healthz`);
      expect(hz.ok).toBe(true);
      const hzJson = (await hz.json()) as { status?: string; transport?: string };
      expect(hzJson.status).toBe("ok");
      expect(hzJson.transport).toBe("streamable-http");

      const health = await grpcHealthCheck(grpcStarted.address, "");
      expect(health.status === 1 || health.status === "SERVING").toBe(true);
    } finally {
      await grpcStarted.shutdown();
      await closeHttpServer(httpSrv);
    }
  }, 30_000);

  it("HTTP /metrics exposes native-protocol HELP; gRPC port does not return that over HTTP GET", async () => {
    const app = await createMcpHttpApp({ mcpPath: "/mcp" });
    const httpSrv = createServer(app);
    httpSrv.listen(0, "127.0.0.1");
    await once(httpSrv, "listening");
    const httpAddr = httpSrv.address();
    if (!httpAddr || typeof httpAddr === "string") throw new Error("http bind");
    const httpBase = `http://127.0.0.1:${httpAddr.port}`;

    const grpcStarted = await maybeStartGrpcMcpServer({
      createMcpServer: createRegisteredMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!grpcStarted) throw new Error("expected gRPC server");

    try {
      const metrics = await fetch(`${httpBase}/metrics`);
      expect(metrics.ok).toBe(true);
      const text = await metrics.text();
      expect(text).toContain("# HELP clawql_native_protocol_graphql_merge_operations");

      const m = /^(.+):(\d+)$/.exec(grpcStarted.address);
      if (!m) throw new Error("bad grpc address");
      const grpcHost = m[1] === "0.0.0.0" ? "127.0.0.1" : m[1];
      const grpcPort = Number.parseInt(m[2], 10);
      const raw = await rawHttpGet(grpcHost, grpcPort, "/metrics", 1500);

      const promLike = raw.raw.includes("# HELP clawql_native_protocol");
      if (raw.statusCode === 200 && promLike) {
        throw new Error(
          "gRPC port unexpectedly served Prometheus HELP over HTTP GET — update parity test if product adds HTTP metrics there"
        );
      }
      expect(promLike).toBe(false);
    } finally {
      await grpcStarted.shutdown();
      await closeHttpServer(httpSrv);
    }
  }, 30_000);
});
