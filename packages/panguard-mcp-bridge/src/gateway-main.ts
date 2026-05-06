#!/usr/bin/env node
/**
 * Streamable HTTP MCP gateway → stdio → `panguard-mcp-proxy` → shim → remote ClawQL HTTP MCP.
 */

import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express } from "express";
import * as grpc from "@grpc/grpc-js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { wireDelegationHandlers } from "./delegate-handlers.js";
import {
  createBridgeJwtExpressMiddleware,
  createBridgeJwtGrpcInterceptor,
} from "./jwt-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_MCP_PATH = "/mcp";

function resolveUpstreamUrl(): string {
  const raw = process.env.CLAWQL_BRIDGE_UPSTREAM_URL?.trim();
  if (raw) {
    return raw;
  }
  const host = process.env.CLAWQL_BRIDGE_UPSTREAM_HOST?.trim() || "clawql-mcp-http";
  const port = process.env.CLAWQL_BRIDGE_UPSTREAM_PORT?.trim() || "8080";
  const path = process.env.CLAWQL_BRIDGE_UPSTREAM_MCP_PATH?.trim() || DEFAULT_MCP_PATH;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `http://${host}:${port}${p}`;
}

function resolveShimEntry(): string {
  return process.env.CLAWQL_BRIDGE_SHIM_PATH?.trim() || join(__dirname, "shim-main.js");
}

function streamableJsonEnabled(): boolean {
  return ["1", "true", "yes"].includes(
    (process.env.CLAWQL_BRIDGE_STREAMABLE_HTTP_JSON_RESPONSE ?? "").trim().toLowerCase()
  );
}

/**
 * CI / integration tests only: skip `panguard-mcp-proxy` and connect the gateway stdio client
 * directly to **`shim-main`** (still reaches upstream HTTP MCP). **Do not use in production** unless
 * another policy layer replaces Panguard.
 */
function directShimToUpstream(): boolean {
  return ["1", "true", "yes"].includes(
    (process.env.CLAWQL_BRIDGE_DIRECT_SHIM ?? "").trim().toLowerCase()
  );
}

/**
 * Env for stdio children. Uses the MCP SDK defaults (safe subset) plus an allowlisted merge from the parent
 * — avoids Vitest/`NODE_OPTIONS` loaders and other runner noise that can hang plain `node` subprocesses.
 */
function envForStdioChild(upstreamUrl: string): Record<string, string> {
  const out: Record<string, string> = { ...getDefaultEnvironment() };
  if (process.env.PATH) {
    out.PATH = process.env.PATH;
  }
  const passthrough = [
    "HOME",
    "USER",
    "USERNAME",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "TZ",
    "NODE_ENV",
    "TEMP",
    "TMPDIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
    "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH",
  ] as const;
  for (const k of passthrough) {
    const v = process.env[k];
    if (v !== undefined && v !== "") {
      out[k] = v;
    }
  }
  out.CLAWQL_BRIDGE_UPSTREAM_URL = upstreamUrl;
  return out;
}

function buildPanguardStdioTransport(upstreamUrl: string, shimPath: string): StdioClientTransport {
  if (directShimToUpstream()) {
    return new StdioClientTransport({
      command: process.execPath,
      args: [shimPath],
      stderr: "inherit",
      env: envForStdioChild(upstreamUrl),
    });
  }
  return new StdioClientTransport({
    command: process.env.CLAWQL_BRIDGE_PANGUARD_COMMAND?.trim() || "npx",
    args: ["-y", "@panguard-ai/panguard-mcp-proxy", "--", process.execPath, shimPath],
    stderr: "inherit",
    env: envForStdioChild(upstreamUrl),
  });
}

/** Connected MCP client over stdio → `panguard-mcp-proxy` → shim (spawn per HTTP initialize or gRPC session). */
async function connectPanguardInnerClient(upstreamUrl: string, shimPath: string): Promise<Client> {
  const innerTransport = buildPanguardStdioTransport(upstreamUrl, shimPath);
  const innerClient = new Client({ name: "clawql-panguard-bridge-inner", version: "0.1.0" }, {});
  try {
    await innerClient.connect(innerTransport);
  } catch (e) {
    await innerClient.close().catch(() => {});
    throw e;
  }
  return innerClient;
}

/** Ensure closing the session MCP server also tears down the stdio inner client. */
function wrapMcpServerCloseWithInnerClient(mcp: McpServer, innerClient: Client): McpServer {
  const baseClose = mcp.close.bind(mcp);
  return new Proxy(mcp, {
    get(target, prop, receiver) {
      if (prop === "close") {
        return async () => {
          await innerClient.close().catch(() => {});
          await baseClose();
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as McpServer;
}

function jsonRpcError(res: import("express").Response, message: string, code = -32000): void {
  res.status(400).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

export async function createPanguardBridgeApp(options?: {
  upstreamUrl?: string;
  shimPath?: string;
}): Promise<Express> {
  const upstreamUrl = options?.upstreamUrl ?? resolveUpstreamUrl();
  const shimPath = options?.shimPath ?? resolveShimEntry();
  const mcpPath = process.env.MCP_PATH?.trim() || DEFAULT_MCP_PATH;

  const transports = new Map<string, StreamableHTTPServerTransport>();
  /** Inner MCP clients (stdio → Panguard); closed when HTTP session ends. */
  const innerClients = new Map<string, Client>();

  const app = createMcpExpressApp({
    host: process.env.MCP_HOST || "0.0.0.0",
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });

  const jwtMw = createBridgeJwtExpressMiddleware();
  if (jwtMw) {
    app.use(mcpPath, jwtMw);
  }

  app.post(mcpPath, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const innerClient = await connectPanguardInnerClient(upstreamUrl, shimPath);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
            innerClients.set(sid, innerClient);
          },
          enableJsonResponse: streamableJsonEnabled(),
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) {
            transports.delete(sid);
            const c = innerClients.get(sid);
            innerClients.delete(sid);
            void c?.close().catch(() => {});
          }
        };

        const server = new Server(
          { name: "clawql-panguard-bridge-gateway", version: "0.1.0" },
          { capabilities: { tools: {}, resources: {}, prompts: {} } }
        );
        wireDelegationHandlers(server, innerClient);
        try {
          await server.connect(transport);
        } catch (serverErr) {
          transport.onclose = undefined;
          void innerClient.close().catch(() => {});
          throw serverErr;
        }
      } else {
        jsonRpcError(
          res,
          "Bad Request: missing/invalid mcp-session-id, or initialize request required."
        );
        return;
      }

      if (!transport) {
        jsonRpcError(res, "Bad Request: transport could not be resolved.");
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      console.error("[clawql-panguard-bridge-gateway] POST /mcp error:", err);
      if (!res.headersSent) {
        res.status(502).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              err instanceof Error
                ? err.message
                : "Bad gateway: failed to attach Panguard / shim / upstream",
          },
          id: null,
        });
      }
    }
  });

  app.get(mcpPath, async (req, res) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req, res) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  return app;
}

function grpcEnabledFromEnv(): boolean {
  const v = process.env.ENABLE_GRPC?.trim().toLowerCase();
  return v === "1" || v === "true";
}

async function main(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? process.env.MCP_PORT ?? "8080", 10);
  const upstreamUrl = resolveUpstreamUrl();
  const shimPath = resolveShimEntry();
  const app = await createPanguardBridgeApp({ upstreamUrl, shimPath });
  app.listen(port, () => {
    const path = process.env.MCP_PATH?.trim() || DEFAULT_MCP_PATH;
    console.error(
      `[clawql-panguard-bridge-gateway] listening on http://0.0.0.0:${port}${path} → upstream ${upstreamUrl}`
    );
  });

  const grpcInterceptors: grpc.ServerInterceptor[] = [];
  const jwtIc = createBridgeJwtGrpcInterceptor();
  if (jwtIc) {
    grpcInterceptors.push(jwtIc);
  }

  let unaryGrpcInner: Client | undefined;
  if (grpcEnabledFromEnv()) {
    unaryGrpcInner = await connectPanguardInnerClient(upstreamUrl, shimPath);
  }

  const grpcStarted = await maybeStartGrpcMcpServer({
    createMcpServer: () => {
      const mcp = new McpServer({ name: "clawql-panguard-bridge-grpc-protobuf", version: "0.1.0" }, {});
      if (unaryGrpcInner) {
        wireDelegationHandlers(mcp.server, unaryGrpcInner);
      }
      return mcp;
    },
    createSessionMcpServer: async () => {
      const innerClient = await connectPanguardInnerClient(upstreamUrl, shimPath);
      const mcp = new McpServer({ name: "clawql-panguard-bridge-grpc-session", version: "0.1.0" }, {});
      wireDelegationHandlers(mcp.server, innerClient);
      return wrapMcpServerCloseWithInnerClient(mcp, innerClient);
    },
    grpcServerOptions: grpcInterceptors.length ? { interceptors: grpcInterceptors } : undefined,
  });
  if (grpcStarted && unaryGrpcInner) {
    const origShutdown = grpcStarted.shutdown.bind(grpcStarted);
    grpcStarted.shutdown = async () => {
      await unaryGrpcInner.close().catch(() => {});
      await origShutdown();
    };
  }
  if (grpcStarted) {
    const refl = grpcStarted.reflectionEnabled ? " reflection=on" : "";
    console.error(
      `[clawql-panguard-bridge-gateway] gRPC MCP ${grpcStarted.address} (mcp-grpc-transport ${grpcStarted.version}; session + protobuf unary→Panguard→shim→HTTP upstream)${refl}`
    );
  }
}

const entry = process.argv[1];
let invokedGatewayCli = false;
if (entry) {
  try {
    invokedGatewayCli = import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    invokedGatewayCli = false;
  }
}
if (invokedGatewayCli) {
  main().catch((err: unknown) => {
    console.error("[clawql-panguard-bridge-gateway] fatal:", err);
    process.exit(1);
  });
}
