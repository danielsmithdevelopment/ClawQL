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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpProtobufServiceImplementation } from "./mcp-protobuf-service.js";
import { McpProtobufBridge } from "./mcp-protobuf-bridge.js";
import { TaskCancellationRegistry } from "./mcp-protobuf-tasks.js";
import { patchProtoLoaderPackageDefinitionForReflection } from "./proto-loader-reflection-patch.js";
import { Effect } from "effect";

export type McpMessageContextHook = (
  extra: MessageExtraInfo
) => <T>(fn: () => T | Promise<T>) => Promise<T>;

let mcpMessageContextHook: McpMessageContextHook | undefined;

/** Optional hook to bind transport metadata (e.g. x402 payment headers) around each MCP message. */
export function setMcpMessageContextHook(hook: McpMessageContextHook | undefined): void {
  mcpMessageContextHook = hook;
}

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
  /**
   * When set, **`mcp.transport.v1.Mcp` Session** uses this factory (e.g. async stdio child spawn).
   * Unary protobuf **`model_context_protocol.Mcp`** still uses one shared instance from {@link createMcpServer}.
   */
  createSessionMcpServer?: () => Promise<McpServer>;
  /** Bind address host:port (default `process.env.GRPC_BIND` or `127.0.0.1:${GRPC_PORT}`). */
  bindAddress?: string;
  /**
   * Host-supplied gateway auth. When set, every Session stream and protobuf MCP call
   * must pass; when unset, plaintext loopback remains open for local tests only.
   * Prefer returning claims so the host can bind ATR scope for tool calls (S2).
   */
  authorizeMetadata?: (
    metadata: grpc.Metadata
  ) => Promise<boolean | GrpcAuthorizeResult> | boolean | GrpcAuthorizeResult;
  /**
   * Run an authorized protobuf handler inside the host's request context
   * (ALS for ATR scope / tenant). Required for per-tool scope on gRPC.
   */
  runWithAuthContext?: <T>(ctx: GrpcAuthContext, fn: () => Promise<T>) => Promise<T>;
  /**
   * Passed to `grpc.Server` (e.g. `interceptors` for OpenTelemetry / metadata, see
   * [Google Cloud gRPC + MCP](https://cloud.google.com/blog/products/networking/grpc-as-a-native-transport-for-mcp)).
   */
  grpcServerOptions?: grpc.ServerOptions;
};

/** Successful gRPC auth — scope/tenant feed MCP request context. */
export type GrpcAuthorizeResult = {
  readonly ok: true;
  readonly scope?: readonly string[];
  readonly tenantId?: string;
  readonly sub?: string;
};

export type GrpcAuthContext = {
  readonly sessionId?: string;
  readonly atrScopeTokens?: readonly string[];
  readonly tenantId?: string;
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
        void (async () => {
          const deliver = (): void => {
            this.onmessage?.(message, extra);
          };
          if (mcpMessageContextHook) {
            await mcpMessageContextHook(extra)(deliver);
          } else {
            deliver();
          }
        })().catch((e) => {
          const err = e instanceof Error ? e : new Error(String(e));
          this.onerror?.(err);
        });
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

function isLoopbackBindHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function getGrpcBindAddress(override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const port = Number.parseInt(process.env.GRPC_PORT ?? "50051", 10);
  const host = (process.env.GRPC_BIND ?? "127.0.0.1").trim() || "127.0.0.1";
  return `${host}:${Number.isFinite(port) ? port : 50051}`;
}

function createServerCredentials(bindHost: string): grpc.ServerCredentials {
  const certPath = process.env.GRPC_TLS_CERT_PATH?.trim();
  const keyPath = process.env.GRPC_TLS_KEY_PATH?.trim();
  const caPath = process.env.GRPC_TLS_CA_PATH?.trim();
  const tier = process.env.CLAWQL_TIER?.trim().toLowerCase();
  const allowInsecure = process.env.GRPC_ALLOW_INSECURE?.trim() === "1";

  if (!certPath || !keyPath) {
    if (tier === "regulated") {
      throw new Error(
        "CLAWQL_TIER=regulated requires gRPC TLS (set GRPC_TLS_CERT_PATH and GRPC_TLS_KEY_PATH)"
      );
    }
    if (!isLoopbackBindHost(bindHost) && !allowInsecure) {
      throw new Error(
        `gRPC plaintext refused on non-loopback bind ${bindHost}; ` +
          "set GRPC_BIND=127.0.0.1, configure TLS, or set GRPC_ALLOW_INSECURE=1"
      );
    }
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

/** Default max protobuf frame size for MCP unary + streams (64 MiB). Set `GRPC_MAX_MESSAGE_LENGTH` (bytes) to override. */
export function defaultGrpcServerMessageSizeBytes(): number {
  const raw = process.env.GRPC_MAX_MESSAGE_LENGTH?.trim();
  if (!raw) return 64 * 1024 * 1024;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 64 * 1024 * 1024;
}

function mergeGrpcServerOptions(user?: grpc.ServerOptions): grpc.ServerOptions {
  const max = defaultGrpcServerMessageSizeBytes();
  const defaults: grpc.ServerOptions = {
    "grpc.max_receive_message_length": max,
    "grpc.max_send_message_length": max,
  };
  return { ...defaults, ...user };
}

/**
 * Starts a gRPC server with `grpc.health.v1.Health` + MCP session when `ENABLE_GRPC` is `1` or `true`.
 * Returns `undefined` when disabled.
 */
async function maybeStartGrpcMcpServerImpl(
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
  const createSessionMcp = options.createSessionMcpServer;
  const version = readTransportPackageVersion();

  const sharedMcpForProtobufRpc = createMcp();
  const protobufBridge = new McpProtobufBridge(sharedMcpForProtobufRpc);
  const protobufTaskRegistry = new TaskCancellationRegistry();

  const authorize = options.authorizeMetadata;
  const runWithAuthContext = options.runWithAuthContext;

  function methodIsResponseStream(serviceDef: grpc.ServiceDefinition, methodName: string): boolean {
    const direct = serviceDef[methodName] as { responseStream?: boolean } | undefined;
    if (direct && typeof direct.responseStream === "boolean") return direct.responseStream;
    const camel = methodName.charAt(0).toLowerCase() + methodName.slice(1);
    const alt = serviceDef[camel] as { responseStream?: boolean } | undefined;
    if (alt && typeof alt.responseStream === "boolean") return alt.responseStream;
    // CallTool is server-streaming in mcp.proto — never treat as unary.
    if (methodName === "CallTool" || camel === "callTool") return true;
    return false;
  }

  async function resolveAuthorize(metadata: grpc.Metadata): Promise<GrpcAuthorizeResult | false> {
    if (!authorize) return { ok: true };
    const raw = await authorize(metadata);
    if (raw === false || raw == null) return false;
    if (raw === true) return { ok: true };
    if (typeof raw === "object" && raw.ok === true) return raw;
    return false;
  }

  function authContextFromResult(result: GrpcAuthorizeResult): GrpcAuthContext {
    const scope = result.scope;
    let atrScopeTokens: string[] | undefined;
    if (scope && scope.length > 0) {
      atrScopeTokens = scope.includes("*") ? ["*"] : [...scope];
    } else if (scope && scope.length === 0) {
      atrScopeTokens = [];
    } else {
      // Boolean-true auth with no claims: unrestricted (tests / noAuth).
      atrScopeTokens = ["*"];
    }
    return {
      sessionId: result.sub ? `grpc:${result.sub}` : "grpc",
      atrScopeTokens,
      tenantId: result.tenantId,
    };
  }

  function rejectStreamingCall(
    call: { emit: (ev: string, err: unknown) => void; end?: () => void },
    message: string
  ): void {
    try {
      call.emit("error", {
        code: grpc.status.UNAUTHENTICATED,
        message,
      });
    } catch {
      /* already closed */
    }
    try {
      call.end?.();
    } catch {
      /* already closed */
    }
  }

  /** Wrap every handler so protobuf MCP is not an open door (S1: streaming-safe). */
  function wrapServiceWithAuth(
    impl: grpc.UntypedServiceImplementation,
    serviceDef: grpc.ServiceDefinition
  ): grpc.UntypedServiceImplementation {
    if (!authorize) return impl;
    const wrapped: grpc.UntypedServiceImplementation = {};
    for (const [method, handler] of Object.entries(impl)) {
      if (typeof handler !== "function") {
        wrapped[method] = handler;
        continue;
      }
      const streaming = methodIsResponseStream(serviceDef, method);
      if (streaming) {
        wrapped[method] = (call: grpc.ServerWritableStream<unknown, unknown>) => {
          void (async () => {
            try {
              const result = await resolveAuthorize(call.metadata);
              if (!result) {
                rejectStreamingCall(call, "gRPC MCP authentication failed");
                return;
              }
              const ctx = authContextFromResult(result);
              const run = async () => {
                (handler as (c: typeof call) => void)(call);
              };
              if (runWithAuthContext) await runWithAuthContext(ctx, run);
              else await run();
            } catch (err: unknown) {
              rejectStreamingCall(
                call,
                err instanceof Error ? err.message : "gRPC MCP authentication failed"
              );
            }
          })();
        };
      } else {
        wrapped[method] = (
          call: grpc.ServerUnaryCall<unknown, unknown>,
          callback: grpc.sendUnaryData<unknown>
        ) => {
          void (async () => {
            try {
              const result = await resolveAuthorize(call.metadata);
              if (!result) {
                callback({
                  code: grpc.status.UNAUTHENTICATED,
                  message: "gRPC MCP authentication failed",
                });
                return;
              }
              const ctx = authContextFromResult(result);
              const invoke = () =>
                Promise.resolve(
                  (handler as grpc.handleUnaryCall<unknown, unknown>)(call, callback)
                );
              if (runWithAuthContext) await runWithAuthContext(ctx, invoke);
              else await invoke();
            } catch (err: unknown) {
              try {
                callback({
                  code: grpc.status.UNAUTHENTICATED,
                  message: err instanceof Error ? err.message : "gRPC MCP authentication failed",
                });
              } catch {
                /* callback missing or already settled — never rethrow (S1) */
              }
            }
          })();
        };
      }
    }
    return wrapped;
  }

  const sessionImpl: grpc.UntypedServiceImplementation = {
    session: (call: grpc.ServerDuplexStream<JsonRpcLineMsg, JsonRpcLineMsg>) => {
      const transport = new GrpcMcpSessionTransport(call);
      let mcpServer: McpServer | undefined;
      call.on("end", () => {
        void mcpServer?.close().catch(() => {});
      });
      void (async () => {
        if (authorize) {
          const result = await resolveAuthorize(call.metadata);
          if (!result) {
            rejectStreamingCall(call, "gRPC MCP authentication failed");
            return;
          }
        }
        const started: Promise<McpServer> = createSessionMcp
          ? createSessionMcp()
          : Promise.resolve(createMcp());
        try {
          const server = await started;
          mcpServer = server;
          await server.connect(transport);
        } catch (err: unknown) {
          const e = err instanceof Error ? err : new Error(String(err));
          transport.onerror?.(e);
          void mcpServer?.close().catch(() => {});
          void transport.close();
        }
      })();
    },
  };

  const server = new grpc.Server(mergeGrpcServerOptions(options.grpcServerOptions));
  server.addService(healthDef, createHealthImplementation());
  server.addService(
    protobufMcpServiceDef,
    wrapServiceWithAuth(
      createMcpProtobufServiceImplementation(protobufBridge, protobufTaskRegistry),
      protobufMcpServiceDef
    )
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
  const bindHost = /^(.+):(\d+)$/.exec(bindAddress)?.[1] ?? "127.0.0.1";
  const creds = createServerCredentials(bindHost);

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
      const host = m ? m[1] : "127.0.0.1";
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

export function maybeStartGrpcMcpServerEffect(
  options: GrpcMcpServerOptions
): Effect.Effect<StartedGrpcServer | undefined, Error> {
  return Effect.tryPromise({
    try: () => maybeStartGrpcMcpServerImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link maybeStartGrpcMcpServerEffect} for Effect callers. */
export async function maybeStartGrpcMcpServer(
  options: GrpcMcpServerOptions
): Promise<StartedGrpcServer | undefined> {
  return Effect.runPromise(maybeStartGrpcMcpServerEffect(options));
}
