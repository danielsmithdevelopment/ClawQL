import { parseArgs } from "node:util";
import { resolveGrpcAddressFromEnv } from "mcp-grpc-transport";
import { startMcpOpenApiGateway } from "./server.js";

function printHelp(): void {
  console.log(`mcp-openapi-gateway — OpenAPI on-ramp over MCP gRPC CallTool

Usage:
  mcp-openapi-gateway [options]

Options:
  --grpc-host <host>     Upstream gRPC host (default GRPC_HOST or 127.0.0.1)
  --grpc-port <port>     Upstream gRPC port (default GRPC_PORT or 50051)
  --grpc-address <addr>  Full host:port (overrides host/port; or CLAWQL_MCP_GRPC_ADDR)
  --listen <host:port>   HTTP bind (default 0.0.0.0:8090)
  --api-key <key>        Optional edge API key
  --refresh-ms <n>       Catalog poll interval (default 0 = off)
  --title <string>       OpenAPI title
  -h, --help             Show help

Env:
  MCP_OPENAPI_GATEWAY_LISTEN, MCP_OPENAPI_GATEWAY_API_KEY,
  MCP_OPENAPI_GATEWAY_REFRESH_MS, MCP_PROTOCOL_VERSION,
  GRPC_HOST, GRPC_PORT, CLAWQL_MCP_GRPC_ADDR

Example (ClawQL or any ENABLE_GRPC MCP server on 50051):
  mcp-openapi-gateway --grpc-address 127.0.0.1:50051 --listen 0.0.0.0:8090
`);
}

function parseListen(raw: string): { host: string; port: number } {
  const trimmed = raw.trim();
  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0) {
    throw new Error(`Invalid --listen value: ${raw} (expected host:port)`);
  }
  const host = trimmed.slice(0, idx);
  const port = Number.parseInt(trimmed.slice(idx + 1), 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid listen port in ${raw}`);
  }
  return { host, port };
}

export async function runCli(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: "boolean", short: "h", default: false },
      "grpc-host": { type: "string" },
      "grpc-port": { type: "string" },
      "grpc-address": { type: "string" },
      listen: { type: "string" },
      "api-key": { type: "string" },
      "refresh-ms": { type: "string" },
      title: { type: "string" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  let grpcAddress =
    values["grpc-address"]?.trim() ||
    process.env.CLAWQL_MCP_GRPC_ADDR?.trim() ||
    "";
  if (!grpcAddress) {
    if (values["grpc-host"] || values["grpc-port"]) {
      const host = values["grpc-host"]?.trim() || process.env.GRPC_HOST?.trim() || "127.0.0.1";
      const port = values["grpc-port"]?.trim() || process.env.GRPC_PORT?.trim() || "50051";
      grpcAddress = `${host}:${port}`;
    } else {
      grpcAddress = resolveGrpcAddressFromEnv();
    }
  }

  const listenRaw =
    values.listen?.trim() ||
    process.env.MCP_OPENAPI_GATEWAY_LISTEN?.trim() ||
    "0.0.0.0:8090";
  const { host, port } = parseListen(listenRaw);

  const apiKey =
    values["api-key"]?.trim() || process.env.MCP_OPENAPI_GATEWAY_API_KEY?.trim() || undefined;
  const refreshMs = Number.parseInt(
    values["refresh-ms"]?.trim() ||
      process.env.MCP_OPENAPI_GATEWAY_REFRESH_MS?.trim() ||
      "0",
    10
  );

  const started = await startMcpOpenApiGateway({
    grpcAddress,
    host,
    port,
    apiKey,
    refreshMs: Number.isFinite(refreshMs) ? refreshMs : 0,
    title: values.title?.trim(),
    protocolVersion: process.env.MCP_PROTOCOL_VERSION?.trim(),
  });

  console.log(`[mcp-openapi-gateway] OpenAPI on-ramp listening on ${started.url}`);
  console.log(`[mcp-openapi-gateway] upstream gRPC: ${started.grpcAddress}`);
  console.log(`[mcp-openapi-gateway] tools: ${started.getCatalog().tools.map((t) => t.name).join(", ") || "(none)"}`);
  console.log(`[mcp-openapi-gateway] docs: ${started.url}/docs`);
  console.log(`[mcp-openapi-gateway] Prefer production CallTool via mcp-grpc-transport on ${started.grpcAddress}`);

  const shutdown = async () => {
    await started.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
