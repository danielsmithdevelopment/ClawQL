/**
 * gRPC transport for MCP: standard `grpc.health.v1.Health` + protobuf `model_context_protocol.Mcp`
 * (unary/stream RPCs) + optional `mcp.transport.v1.Mcp.Session` (JSON-RPC lines).
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ReflectionService } from "@grpc/reflection";
import type {
  IsomorphicHeaders,
  JSONRPCMessage,
  MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpProtobufServiceImplementation } from "./mcp-protobuf-service.js";
import { McpProtobufBridge } from "./mcp-protobuf-bridge.js";
import { TaskCancellationRegistry } from "./mcp-protobuf-tasks.js";
import { patchProtoLoaderPackageDefinitionForReflection } from "./proto-loader-reflection-patch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const wellKnownProtoRoot = dirname(require.resolve("google-proto-files/package.json"));

/**
 * Fully-qualified gRPC service name for `grpc.health.v1.Health/Check` when scoping by MCP session.
 * (Vendor-neutral proto — not tied to a single product.)
 */
export const MCP_TRANSPORT_SESSION_SERVICE_FQN = "mcp.transport.v1.Mcp";

/** Fully-qualified gRPC service name for protobuf MCP RPCs (`model_context_protocol.Mcp`). */
export const PROTOBUF_MCP_SERVICE_FQN = "model_context_protocol.Mcp";

function resolveProtoRoot(): string {
  return join(__dirname, "../proto");
}

function loadAllProtos(): protoLoader.PackageDefinition {
  const protoRoot = resolveProtoRoot();
  // Load well-known types explicitly so @grpc/reflection indexes `google.protobuf.*`
  // (e.g. `Value` in struct.proto). Relying only on `import` resolution can omit
  // separate FileDescriptorProtos, which breaks grpcurl when resolving MCP messages.
  const googleStruct = join(wellKnownProtoRoot, "google/protobuf/struct.proto");
  const googleDuration = join(wellKnownProtoRoot, "google/protobuf/duration.proto");
  return protoLoader.loadSync(
    [
      googleStruct,
      googleDuration,
      join(protoRoot, "grpc/health/v1/health.proto"),
      join(protoRoot, "mcp/transport/v1/mcp.proto"),
      join(protoRoot, "model_context_protocol/mcp.proto"),
    ],
    {
      includeDirs: [protoRoot, wellKnownProtoRoot],
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }
  );
}

function loadProtosForGrpc(): protoLoader.PackageDefinition {
  const def = loadAllProtos();
  patchProtoLoaderPackageDefinitionForReflection(def);
  return def;
}

function readTransportPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, "../package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export type GrpcMcpServerOptions = {
  /** New MCP server instance per gRPC session (same lifecycle as Streamable HTTP). */
  createMcpServer: () => McpServer;
  /** Bind address host:port (default `process.env.GRPC_BIND` or `0.0.0.0:${GRPC_PORT}`). */
  bindAddress?: string;
  /**
   * Passed to `grpc.Server` (e.g. `interceptors` for OpenTelemetry / metadata, see
   * [Google Cloud gRPC + MCP](https://cloud.google.com/blog/products/networking/grpc-as-a-native-transport-for-mcp)).
   */
  grpcServerOptions?: grpc.ServerOptions;
};

export type StartedGrpcServer = {
  /** Bound host:port (e.g. `127.0.0.1:54321` when using port 0). */
  address: string;
  /** `mcp-grpc-transport` package version (for logs). */
  version: string;
  reflectionEnabled: boolean;
  shutdown: () => Promise<void>;
};

type JsonRpcLineMsg = {
  line?: string | null;
  related_request_id?: string | null;
  resumption_token?: string | null;
};

type ServiceWithDef = grpc.ServiceClientConstructor;

function metadataToHeaderRecord(md: grpc.Metadata): IsomorphicHeaders {
  const headers: IsomorphicHeaders = {};
  const map = md.getMap();
  for (const [key, val] of Object.entries(map)) {
    if (val === undefined) {
      continue;
    }
    headers[key] = Buffer.isBuffer(val) ? val.toString("utf8") : String(val);
  }
  return headers;
}

function headerGet(headers: IsomorphicHeaders, name: string): string | undefined {
  const lower = name.toLowerCase();
  const v = headers[lower] ?? headers[name];
  if (v === undefined) {
    return undefined;
  }
  return Array.isArray(v) ? v[0] : v;
}

function parseBearerAuth(headers: IsomorphicHeaders): AuthInfo | undefined {
  const raw = headerGet(headers, "authorization");
  if (!raw) {
    return undefined;
  }
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  if (!m?.[1]) {
    return undefined;
  }
  return {
    token: m[1],
    clientId: "",
    scopes: [],
    extra: { transport: "grpc" },
  };
}

function sessionIdFromMetadata(md: grpc.Metadata): string | undefined {
  const tryKeys = ["mcp-session-id", "mcp_session_id"];
  for (const k of tryKeys) {
    const v = md.get(k)[0];
    if (v !== undefined) {
      return Buffer.isBuffer(v) ? v.toString("utf8") : String(v);
    }
  }
  return undefined;
}

function buildGrpcSessionMessageExtra(
  call: grpc.ServerDuplexStream<JsonRpcLineMsg, JsonRpcLineMsg>,
  frame?: { related_request_id?: string; resumption_token?: string }
): MessageExtraInfo {
  const headers = metadataToHeaderRecord(call.metadata);
  headers["x-grpc-peer"] = call.getPeer();
  headers["x-grpc-host"] = call.getHost();
  headers["x-grpc-path"] = call.getPath();
  if (frame?.related_request_id) {
    headers["x-mcp-transport-related-request-id"] = frame.related_request_id;
  }
  if (frame?.resumption_token) {
    headers["x-mcp-transport-resumption-token"] = frame.resumption_token;
  }
  const authInfo = parseBearerAuth(headers);
  const extra: MessageExtraInfo = {
    requestInfo: { headers },
  };
  if (authInfo) {
    extra.authInfo = authInfo;
  }
  return extra;
}

type LoadedGrpcPackage = {
  grpc: {
    health: {
      v1: {
        Health: ServiceWithDef;
      };
    };
  };
  mcp: {
    transport: {
      v1: {
        Mcp: ServiceWithDef;
      };
    };
  };
  model_context_protocol: {
    Mcp: ServiceWithDef;
  };
};

/**
 * MCP `Transport` backed by a gRPC duplex stream (`JsonRpcLine`).
 */
export class GrpcMcpSessionTransport implements Transport {
  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  setProtocolVersion?: (version: string) => void;

  private readonly call: grpc.ServerDuplexStream<JsonRpcLineMsg, JsonRpcLineMsg>;
  private started = false;
  private closed = false;

  constructor(call: grpc.ServerDuplexStream<JsonRpcLineMsg, JsonRpcLineMsg>) {
    this.call = call;
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error("GrpcMcpSessionTransport already started");
    }
    this.started = true;

    const sid = sessionIdFromMetadata(this.call.metadata);
    if (sid) {
      this.sessionId = sid;
    }

    this.call.on("data", (msg: JsonRpcLineMsg) => {
      try {
        const line = msg?.line;
        if (line == null || line === "") {
          return;
        }
        const parsed: unknown = JSON.parse(line);
        const message = JSONRPCMessageSchema.parse(parsed);
        const extra = buildGrpcSessionMessageExtra(this.call, {
          related_request_id: msg.related_request_id ?? undefined,
          resumption_token: msg.resumption_token ?? undefined,
        });
        this.onmessage?.(message, extra);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.onerror?.(err);
      }
    });

    this.call.on("end", () => {
      void this.close();
    });

    this.call.on("error", (err: Error) => {
      this.onerror?.(err);
    });
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    const line = JSON.stringify(message);
    const payload: JsonRpcLineMsg = { line };
    if (options?.relatedRequestId !== undefined) {
      payload.related_request_id = String(options.relatedRequestId);
    }
    if (options?.resumptionToken != null && options.resumptionToken !== "") {
      payload.resumption_token = String(options.resumptionToken);
    }
    await new Promise<void>((resolve, reject) => {
      this.call.write(payload, (err: Error | null | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });
    if (options?.onresumptiontoken && options.resumptionToken) {
      try {
        options.onresumptiontoken(String(options.resumptionToken));
      } catch {
        /* user callback */
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.call.end();
    } catch {
      /* ignore */
    }
    this.onclose?.();
  }
}

const SERVING = 1;
const SERVICE_UNKNOWN = 3;

function createHealthImplementation(): grpc.UntypedServiceImplementation {
  return {
    check: (
      call: grpc.ServerUnaryCall<{ service?: string }, { status?: number }>,
      callback: grpc.sendUnaryData<{ status?: number }>
    ) => {
      const svc = call.request?.service ?? "";
      if (
        svc === "" ||
        svc === MCP_TRANSPORT_SESSION_SERVICE_FQN ||
        svc === PROTOBUF_MCP_SERVICE_FQN
      ) {
        callback(null, { status: SERVING });
      } else {
        callback(null, { status: SERVICE_UNKNOWN });
      }
    },
    watch: (call: grpc.ServerWritableStream<{ service?: string }, { status?: number }>) => {
      const svc = call.request?.service ?? "";
      const st =
        svc === "" || svc === MCP_TRANSPORT_SESSION_SERVICE_FQN || svc === PROTOBUF_MCP_SERVICE_FQN
          ? SERVING
          : SERVICE_UNKNOWN;
      call.write({ status: st });
      call.on("cancelled", () => {
        call.end();
      });
    },
  };
}

function getGrpcBindAddress(override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const port = Number.parseInt(process.env.GRPC_PORT ?? "50051", 10);
  const host = (process.env.GRPC_BIND ?? "0.0.0.0").trim() || "0.0.0.0";
  return `${host}:${Number.isFinite(port) ? port : 50051}`;
}

function createServerCredentials(): grpc.ServerCredentials {
  const certPath = process.env.GRPC_TLS_CERT_PATH?.trim();
  const keyPath = process.env.GRPC_TLS_KEY_PATH?.trim();
  const caPath = process.env.GRPC_TLS_CA_PATH?.trim();

  if (!certPath || !keyPath) {
    return grpc.ServerCredentials.createInsecure();
  }

  const certChain = readFileSync(certPath);
  const privateKey = readFileSync(keyPath);
  const rootCerts = caPath ? readFileSync(caPath) : null;
  const requireClientCert = process.env.GRPC_TLS_REQUIRE_CLIENT_CERT === "1";

  return grpc.ServerCredentials.createSsl(
    rootCerts,
    [{ cert_chain: certChain, private_key: privateKey }],
    requireClientCert
  );
}

/**
 * Starts a gRPC server with `grpc.health.v1.Health` + MCP session when `ENABLE_GRPC` is `1` or `true`.
 * Returns `undefined` when disabled.
 */
export async function maybeStartGrpcMcpServer(
  options: GrpcMcpServerOptions
): Promise<StartedGrpcServer | undefined> {
  const enabled = process.env.ENABLE_GRPC?.trim();
  if (enabled !== "1" && enabled?.toLowerCase() !== "true") {
    return undefined;
  }

  const packageDefinition = loadProtosForGrpc();
  const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as LoadedGrpcPackage;

  const healthDef = loaded.grpc.health.v1.Health.service;
  const mcpDef = loaded.mcp.transport.v1.Mcp.service;
  const protobufMcpServiceDef = loaded.model_context_protocol.Mcp.service;

  const createMcp = options.createMcpServer;
  const version = readTransportPackageVersion();

  const sharedMcpForProtobufRpc = createMcp();
  const protobufBridge = new McpProtobufBridge(sharedMcpForProtobufRpc);
  const protobufTaskRegistry = new TaskCancellationRegistry();

  const sessionImpl: grpc.UntypedServiceImplementation = {
    session: (call: grpc.ServerDuplexStream<JsonRpcLineMsg, JsonRpcLineMsg>) => {
      const transport = new GrpcMcpSessionTransport(call);
      const server = createMcp();
      void server.connect(transport).catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        transport.onerror?.(e);
        void transport.close();
      });

      call.on("end", () => {
        void server.close().catch(() => {});
      });
    },
  };

  const server = new grpc.Server(options.grpcServerOptions);
  server.addService(healthDef, createHealthImplementation());
  server.addService(
    protobufMcpServiceDef,
    createMcpProtobufServiceImplementation(protobufBridge, protobufTaskRegistry)
  );
  server.addService(mcpDef, sessionImpl);

  let reflectionEnabled = false;
  const refl = process.env.ENABLE_GRPC_REFLECTION?.trim();
  if (refl === "1" || refl?.toLowerCase() === "true") {
    const reflection = new ReflectionService(packageDefinition, {
      services: ["grpc.health.v1.Health", "model_context_protocol.Mcp", "mcp.transport.v1.Mcp"],
    });
    reflection.addToServer(server);
    reflectionEnabled = true;
  }

  const bindAddress = getGrpcBindAddress(options.bindAddress);
  const creds = createServerCredentials();

  const resolvedAddress = await new Promise<string>((resolve, reject) => {
    server.bindAsync(bindAddress, creds, (err, boundPort) => {
      if (err) {
        reject(err);
        return;
      }
      if (typeof boundPort !== "number" || boundPort <= 0) {
        reject(new Error(`gRPC bind failed: invalid port ${String(boundPort)}`));
        return;
      }
      const m = /^(.+):(\d+)$/.exec(bindAddress);
      const host = m ? m[1] : "0.0.0.0";
      resolve(`${host}:${boundPort}`);
    });
  });

  return {
    address: resolvedAddress,
    version,
    reflectionEnabled,
    shutdown: async () => {
      await protobufBridge.close().catch(() => {});
      await new Promise<void>((resolve) => {
        server.tryShutdown(() => resolve());
      });
    },
  };
}
