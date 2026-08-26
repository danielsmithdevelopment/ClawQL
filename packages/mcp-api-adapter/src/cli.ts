import { parseArgs } from "node:util";
import { resolveGrpcAddressFromEnv } from "mcp-grpc-transport";
import { generateToolCli } from "./gen-cli.js";
import { startMcpApiAdapter } from "./server.js";
import { connectUpstream } from "./upstream.js";
import type { UpstreamOptions } from "./types.js";

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return undefined;
}

function printHelp(): void {
  console.log(`mcp-api-adapter — point at ANY MCP server; get OpenAPI + GraphQL + /mcp + gRPC

Standalone npm package (no ClawQL install required).

Usage:
  npx mcp-api-adapter --mcp-url <url> [options]
  npx mcp-api-adapter --stdio -- <command> [args…]
  npx mcp-api-adapter --grpc-address <host:port> [options]
  npx mcp-api-adapter gen-cli --out <dir> [upstream opts…]

Upstream (exactly one):
  --mcp-url <url>        Streamable HTTP MCP endpoint
  --stdio -- <cmd…>      Spawn an MCP server over stdio
  --grpc-address <addr>  Existing MCP gRPC server

HTTP APIs:
  --listen <host:port>   Bind OpenAPI + GraphQL + /mcp (default 0.0.0.0:8090)
  --mcp-path <path>      Streamable HTTP MCP path (default /mcp)
  --no-mcp               Disable Streamable HTTP /mcp surface
  --ws-path <path>       WebSocket tool-call path (default /ws)
  --no-ws                Disable WebSocket surface
  --mcp-ui-path <path>   HTMX MCP UI playground path (default /mcp-ui)
  --no-mcp-ui            Disable /mcp-ui browser surface
  --no-mcp-ui-atr-scoped  Show full catalog in /mcp-ui (ignore ATR tool filter)
  --api-key <key>        Optional edge API key
  --jwks-url <url>       Accept ClawQL MCP JWTs via JWKS (/.well-known/jwks.json)
  --jwt-issuer <iss>     Expected JWT iss when verifying MCP tokens
  --refresh-ms <n>       Catalog poll interval (default 0 = off)
  --title <string>       Docs / GraphiQL title

Scaffolded gRPC (stdio / HTTP upstreams only):
  --grpc-listen <addr>   Bind for local MCP gRPC API (default 127.0.0.1:0)
  --no-grpc              Do not scaffold a local gRPC API

gen-cli:
  --out <dir>            Output directory (required)
  --name <bin>           CLI / package name (default mcp-tools)
  --base-url <url>       Default adapter URL baked into CLI

  -h, --help             Show help

Instant examples:
  npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything
  npx mcp-api-adapter gen-cli --out ./my-cli --mcp-url http://127.0.0.1:8080/mcp
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

function parseUpstream(
  values: Record<string, string | boolean | undefined>,
  stdioCmd: string[] | null
): UpstreamOptions {
  if (typeof values["mcp-url"] === "string" && values["mcp-url"].trim()) {
    return { kind: "http", url: values["mcp-url"].trim() };
  }
  if (values.stdio) {
    if (!stdioCmd || stdioCmd.length === 0) {
      throw new Error("With --stdio, pass a command after -- (e.g. --stdio -- npx -y @pkg)");
    }
    return {
      kind: "stdio",
      command: stdioCmd[0]!,
      args: stdioCmd.slice(1),
    };
  }
  let grpcAddress =
    (typeof values["grpc-address"] === "string" && values["grpc-address"].trim()) ||
    process.env.CLAWQL_MCP_GRPC_ADDR?.trim() ||
    "";
  if (!grpcAddress) {
    if (values["grpc-host"] || values["grpc-port"]) {
      const host =
        (typeof values["grpc-host"] === "string" && values["grpc-host"].trim()) ||
        process.env.GRPC_HOST?.trim() ||
        "127.0.0.1";
      const port =
        (typeof values["grpc-port"] === "string" && values["grpc-port"].trim()) ||
        process.env.GRPC_PORT?.trim() ||
        "50051";
      grpcAddress = `${host}:${port}`;
    } else {
      grpcAddress = resolveGrpcAddressFromEnv();
    }
  }
  if (!grpcAddress) {
    throw new Error("Provide --mcp-url, --stdio -- <cmd…>, or --grpc-address");
  }
  return {
    kind: "grpc",
    address: grpcAddress,
    protocolVersion: process.env.MCP_PROTOCOL_VERSION?.trim(),
  };
}

const sharedOpts = {
  help: { type: "boolean", short: "h", default: false },
  "mcp-url": { type: "string" },
  stdio: { type: "boolean", default: false },
  "grpc-host": { type: "string" },
  "grpc-port": { type: "string" },
  "grpc-address": { type: "string" },
  "grpc-listen": { type: "string" },
  "no-grpc": { type: "boolean", default: false },
  "mcp-path": { type: "string" },
  "no-mcp": { type: "boolean", default: false },
  "ws-path": { type: "string" },
  "no-ws": { type: "boolean", default: false },
  "mcp-ui-path": { type: "string" },
  "no-mcp-ui": { type: "boolean", default: false },
  "no-mcp-ui-atr-scoped": { type: "boolean", default: false },
  listen: { type: "string" },
  "api-key": { type: "string" },
  "jwks-url": { type: "string" },
  "jwt-issuer": { type: "string" },
  "refresh-ms": { type: "string" },
  title: { type: "string" },
  out: { type: "string" },
  name: { type: "string" },
  "base-url": { type: "string" },
} as const;

async function runGenCli(argv: string[]): Promise<void> {
  const { flags, stdioCmd } = splitStdioArgv(argv);
  const { values } = parseArgs({
    args: flags,
    options: sharedOpts,
    allowPositionals: false,
  });
  if (values.help) {
    printHelp();
    return;
  }
  const outDir = values.out?.trim();
  if (!outDir) throw new Error("gen-cli requires --out <dir>");

  const upstream = parseUpstream(values, stdioCmd);
  const conn = await connectUpstream(upstream, { grpcListen: false });
  try {
    const result = await generateToolCli({
      outDir,
      name: values.name?.trim(),
      baseUrl: values["base-url"]?.trim(),
      tools: conn.tools,
      upstreamLabel: conn.label,
    });
    console.log(`[mcp-api-adapter] gen-cli wrote ${result.binName} → ${result.outDir}`);
    for (const f of result.files) console.log(`  ${f}`);
    console.log(`[mcp-api-adapter] try: node ${result.outDir}/bin/${result.binName}.mjs list`);
  } finally {
    await conn.close();
  }
}

async function runServe(argv: string[]): Promise<void> {
  const { flags, stdioCmd } = splitStdioArgv(argv);
  const { values } = parseArgs({
    args: flags,
    options: sharedOpts,
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  const upstream = parseUpstream(values, stdioCmd);

  const listenRaw =
    values.listen?.trim() ||
    envFirst("MCP_API_ADAPTER_LISTEN", "MCP_OPENAPI_GATEWAY_LISTEN") ||
    "0.0.0.0:8090";
  const { host, port } = parseListen(listenRaw);

  const apiKey =
    values["api-key"]?.trim() ||
    envFirst("MCP_API_ADAPTER_API_KEY", "MCP_OPENAPI_GATEWAY_API_KEY") ||
    undefined;
  const jwksUrl =
    values["jwks-url"]?.trim() ||
    envFirst("MCP_API_ADAPTER_JWKS_URL", "CLAWQL_MCP_OAUTH_JWKS_URL") ||
    undefined;
  const jwtIssuer =
    values["jwt-issuer"]?.trim() ||
    envFirst("MCP_API_ADAPTER_JWT_ISSUER", "CLAWQL_MCP_OAUTH_ISSUER") ||
    undefined;
  const jwtHs256Secret =
    envFirst("MCP_API_ADAPTER_JWT_HS256_SECRET", "CLAWQL_MCP_OAUTH_SIGNING_SECRET") || undefined;
  const jwtAuth =
    jwksUrl || jwtHs256Secret
      ? {
          jwksUrl,
          issuer: jwtIssuer,
          hs256Secret: jwksUrl ? undefined : jwtHs256Secret,
        }
      : undefined;
  const refreshMs = Number.parseInt(
    values["refresh-ms"]?.trim() ||
      envFirst("MCP_API_ADAPTER_REFRESH_MS", "MCP_OPENAPI_GATEWAY_REFRESH_MS") ||
      "0",
    10
  );

  const grpcListenRaw =
    values["grpc-listen"]?.trim() ||
    envFirst("MCP_API_ADAPTER_GRPC_LISTEN", "MCP_OPENAPI_GATEWAY_GRPC_LISTEN") ||
    undefined;
  const grpcListen: string | false = values["no-grpc"]
    ? false
    : grpcListenRaw || (upstream.kind === "grpc" ? false : "127.0.0.1:0");

  const mcpPath: string | false = values["no-mcp"]
    ? false
    : values["mcp-path"]?.trim() ||
      envFirst("MCP_API_ADAPTER_MCP_PATH") ||
      "/mcp";

  const wsPath: string | false = values["no-ws"]
    ? false
    : values["ws-path"]?.trim() ||
      envFirst("MCP_API_ADAPTER_WS_PATH") ||
      "/ws";

  const mcpUiPath: string | false = values["no-mcp-ui"]
    ? false
    : values["mcp-ui-path"]?.trim() ||
      envFirst("MCP_API_ADAPTER_MCP_UI_PATH") ||
      "/mcp-ui";

  const mcpUiAtrScoped = !values["no-mcp-ui-atr-scoped"];

  const started = await startMcpApiAdapter({
    upstream,
    host,
    port,
    apiKey,
    jwtAuth,
    refreshMs: Number.isFinite(refreshMs) ? refreshMs : 0,
    title: values.title?.trim(),
    grpcListen,
    mcpPath,
    wsPath,
    mcpUiPath,
    mcpUiAtrScoped,
    protocolVersion: process.env.MCP_PROTOCOL_VERSION?.trim(),
  });

  const catalog = started.getCatalog();
  console.log(`[mcp-api-adapter] ready — ${started.url}`);
  console.log(`[mcp-api-adapter] upstream (${started.upstreamKind}): ${started.upstream}`);
  console.log(
    `[mcp-api-adapter] APIs: ${catalog.surfaces.join(", ")}` +
      (started.grpcAddress ? ` (gRPC ${started.grpcAddress})` : "")
  );
  console.log(
    `[mcp-api-adapter] tools: ${catalog.tools.map((t) => t.name).join(", ") || "(none)"}`
  );
  console.log(`[mcp-api-adapter] docs:     ${started.url}/docs`);
  console.log(`[mcp-api-adapter] graphiql: ${started.url}/graphiql`);
  console.log(`[mcp-api-adapter] graphql:  ${started.url}/graphql`);
  if (started.mcpPath) {
    console.log(`[mcp-api-adapter] mcp:      ${started.url}${started.mcpPath}`);
  }
  if (started.wsUrl) {
    console.log(`[mcp-api-adapter] websocket: ${started.wsUrl}`);
  }
  if (started.mcpUiPath) {
    console.log(`[mcp-api-adapter] mcp-ui:   ${started.url}${started.mcpUiPath}`);
  }
  if (started.grpcAddress) {
    console.log(
      `[mcp-api-adapter] gRPC CallTool (mcp-grpc-transport): ${started.grpcAddress}`
    );
  }

  const shutdown = async () => {
    await started.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

export async function runCli(argv: string[]): Promise<void> {
  if (argv[0] === "gen-cli") {
    await runGenCli(argv.slice(1));
    return;
  }
  await runServe(argv);
}
