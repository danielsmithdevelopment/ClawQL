import { parseArgs } from "node:util";
import { resolveGrpcAddressFromEnv } from "mcp-grpc-transport";
import { startMcpGateway } from "./server.js";
import type { UpstreamOptions } from "./types.js";

function printHelp(): void {
  console.log(`mcp-openapi-gateway — scaffold OpenAPI + GraphQL (+ gRPC) for ANY MCP server

Usage:
  mcp-openapi-gateway --mcp-url <url> [options]
  mcp-openapi-gateway --stdio -- <command> [args…]
  mcp-openapi-gateway --grpc-address <host:port> [options]

Upstream (exactly one):
  --mcp-url <url>        Streamable HTTP MCP endpoint (e.g. http://127.0.0.1:8080/mcp)
  --stdio -- <cmd…>      Spawn an MCP server over stdio (everything after --)
  --grpc-address <addr>  Existing MCP gRPC server (mcp-grpc-transport)
  --grpc-host / --grpc-port   Alternative to --grpc-address

HTTP on-ramp:
  --listen <host:port>   OpenAPI + GraphQL bind (default 0.0.0.0:8090)
  --api-key <key>        Optional edge API key
  --refresh-ms <n>       Catalog poll interval (default 0 = off)
  --title <string>       Docs / GraphiQL title

Scaffolded gRPC (stdio / HTTP upstreams only):
  --grpc-listen <addr>   Bind for local MCP gRPC surface (default 127.0.0.1:0)
  --no-grpc              Do not scaffold a local gRPC surface

  -h, --help             Show help

Env:
  MCP_OPENAPI_GATEWAY_LISTEN, MCP_OPENAPI_GATEWAY_API_KEY,
  MCP_OPENAPI_GATEWAY_REFRESH_MS, MCP_OPENAPI_GATEWAY_GRPC_LISTEN,
  MCP_PROTOCOL_VERSION, GRPC_HOST, GRPC_PORT, CLAWQL_MCP_GRPC_ADDR

Examples:
  # Wrap any Streamable HTTP MCP server → REST + GraphQL + local gRPC
  mcp-openapi-gateway --mcp-url http://127.0.0.1:8080/mcp --listen 0.0.0.0:8090

  # Wrap a stdio MCP package
  mcp-openapi-gateway --stdio -- npx -y @modelcontextprotocol/server-everything

  # Point at an existing gRPC MCP server (ClawQL / ENABLE_GRPC)
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

function splitStdioArgv(argv: string[]): { flags: string[]; stdioCmd: string[] | null } {
  const idx = argv.indexOf("--");
  if (idx < 0) return { flags: argv, stdioCmd: null };
  return { flags: argv.slice(0, idx), stdioCmd: argv.slice(idx + 1) };
}

export async function runCli(argv: string[]): Promise<void> {
  const { flags, stdioCmd } = splitStdioArgv(argv);
  const { values } = parseArgs({
    args: flags,
    options: {
      help: { type: "boolean", short: "h", default: false },
      "mcp-url": { type: "string" },
      stdio: { type: "boolean", default: false },
      "grpc-host": { type: "string" },
      "grpc-port": { type: "string" },
      "grpc-address": { type: "string" },
      "grpc-listen": { type: "string" },
      "no-grpc": { type: "boolean", default: false },
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

  let upstream: UpstreamOptions | undefined;

  if (values["mcp-url"]?.trim()) {
    upstream = { kind: "http", url: values["mcp-url"].trim() };
  } else if (values.stdio) {
    if (!stdioCmd || stdioCmd.length === 0) {
      throw new Error("With --stdio, pass a command after -- (e.g. --stdio -- npx -y @pkg)");
    }
    upstream = {
      kind: "stdio",
      command: stdioCmd[0]!,
      args: stdioCmd.slice(1),
    };
  } else {
    let grpcAddress =
      values["grpc-address"]?.trim() ||
      process.env.CLAWQL_MCP_GRPC_ADDR?.trim() ||
      "";
    if (!grpcAddress) {
      if (values["grpc-host"] || values["grpc-port"]) {
        const host = values["grpc-host"]?.trim() || process.env.GRPC_HOST?.trim() || "127.0.0.1";
        const port = values["grpc-port"]?.trim() || process.env.GRPC_PORT?.trim() || "50051";
        grpcAddress = `${host}:${port}`;
      } else if (!values["mcp-url"] && !values.stdio) {
        // Default: env-resolved gRPC (backward compatible)
        grpcAddress = resolveGrpcAddressFromEnv();
      }
    }
    if (grpcAddress) {
      upstream = {
        kind: "grpc",
        address: grpcAddress,
        protocolVersion: process.env.MCP_PROTOCOL_VERSION?.trim(),
      };
    }
  }

  if (!upstream) {
    printHelp();
    throw new Error("Provide --mcp-url, --stdio -- <cmd…>, or --grpc-address");
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

  const grpcListenRaw =
    values["grpc-listen"]?.trim() ||
    process.env.MCP_OPENAPI_GATEWAY_GRPC_LISTEN?.trim() ||
    undefined;
  const grpcListen: string | false = values["no-grpc"]
    ? false
    : grpcListenRaw || (upstream.kind === "grpc" ? false : "127.0.0.1:0");

  const started = await startMcpGateway({
    upstream,
    host,
    port,
    apiKey,
    refreshMs: Number.isFinite(refreshMs) ? refreshMs : 0,
    title: values.title?.trim(),
    grpcListen,
    protocolVersion: process.env.MCP_PROTOCOL_VERSION?.trim(),
  });

  const catalog = started.getCatalog();
  console.log(`[mcp-openapi-gateway] listening on ${started.url}`);
  console.log(`[mcp-openapi-gateway] upstream (${started.upstreamKind}): ${started.upstream}`);
  console.log(
    `[mcp-openapi-gateway] surfaces: ${catalog.surfaces.join(", ")}` +
      (started.grpcAddress ? ` (gRPC ${started.grpcAddress})` : "")
  );
  console.log(
    `[mcp-openapi-gateway] tools: ${catalog.tools.map((t) => t.name).join(", ") || "(none)"}`
  );
  console.log(`[mcp-openapi-gateway] docs:     ${started.url}/docs`);
  console.log(`[mcp-openapi-gateway] graphiql: ${started.url}/graphiql`);
  console.log(`[mcp-openapi-gateway] graphql:  ${started.url}/graphql`);
  if (started.grpcAddress) {
    console.log(
      `[mcp-openapi-gateway] Prefer production CallTool via mcp-grpc-transport on ${started.grpcAddress}`
    );
  }

  const shutdown = async () => {
    await started.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
