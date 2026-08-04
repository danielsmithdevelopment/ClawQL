/**
 * Connect to any MCP upstream (gRPC, stdio, or Streamable HTTP) and expose:
 * - `callTool` for REST/GraphQL
 * - `createBridgedMcpServer` for Streamable HTTP `/mcp` + local gRPC scaffold
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listToolsUnaryGrpc,
  maybeStartGrpcMcpServer,
  type ListedMcpTool,
  type StartedGrpcServer,
} from "mcp-grpc-transport";
import { callToolViaGrpc, collapseSdkToolResult } from "./call.js";
import { wireDelegationHandlers, wireGrpcDelegationHandlers } from "./delegate.js";
import type {
  ApiSurface,
  CallToolFn,
  ToolCatalog,
  UpstreamKind,
  UpstreamOptions,
} from "./types.js";

const ADAPTER_VERSION = "0.5.1";

const BRIDGE_CAPS = {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
} as const;

export type UpstreamConnection = {
  kind: UpstreamKind;
  label: string;
  tools: ListedMcpTool[];
  callTool: CallToolFn;
  /** gRPC address for clients (upstream or locally scaffolded). */
  grpcAddress?: string;
  /** True when this process started a local gRPC MCP server. */
  localGrpc: boolean;
  /** Create an McpServer that delegates to this upstream (for /mcp sessions + gRPC). */
  createBridgedMcpServer: () => McpServer;
  refreshTools: () => Promise<ListedMcpTool[]>;
  close: () => Promise<void>;
};

function asListedTools(
  tools: Array<{
    name: string;
    description?: string;
    title?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }>
): ListedMcpTool[] {
  return tools.map((t) => ({
    name: String(t.name),
    description: t.description != null ? String(t.description) : undefined,
    title: t.title != null ? String(t.title) : undefined,
    inputSchema:
      t.inputSchema && typeof t.inputSchema === "object"
        ? (t.inputSchema as Record<string, unknown>)
        : { type: "object", properties: {} },
    outputSchema:
      t.outputSchema && typeof t.outputSchema === "object"
        ? (t.outputSchema as Record<string, unknown>)
        : undefined,
  }));
}

export function catalogSurfaces(options: {
  grpcAddress?: string;
  mcpPath?: string;
}): ApiSurface[] {
  const surfaces: ApiSurface[] = ["openapi", "graphql"];
  if (options.mcpPath) surfaces.push("mcp");
  if (options.grpcAddress) surfaces.push("grpc");
  return surfaces;
}

export function buildCatalogFromUpstream(
  upstream: UpstreamConnection,
  extras?: { tools?: ListedMcpTool[]; mcpPath?: string }
): ToolCatalog {
  const list = extras?.tools ?? upstream.tools;
  const mcpPath = extras?.mcpPath;
  return {
    tools: list,
    fetchedAt: new Date().toISOString(),
    grpcAddress: upstream.grpcAddress,
    mcpPath,
    upstream: upstream.label,
    upstreamKind: upstream.kind,
    surfaces: catalogSurfaces({
      grpcAddress: upstream.grpcAddress,
      mcpPath,
    }),
  };
}

function newBridgeServer(name: string): McpServer {
  return new McpServer({ name, version: ADAPTER_VERSION }, { ...BRIDGE_CAPS });
}

async function scaffoldLocalGrpc(
  createBridgedMcpServer: () => McpServer,
  listen: string
): Promise<StartedGrpcServer | undefined> {
  const prev = process.env.ENABLE_GRPC;
  process.env.ENABLE_GRPC = "1";
  try {
    return await maybeStartGrpcMcpServer({
      createMcpServer: createBridgedMcpServer,
      createSessionMcpServer: async () => createBridgedMcpServer(),
      bindAddress: listen,
    });
  } finally {
    if (prev === undefined) delete process.env.ENABLE_GRPC;
    else process.env.ENABLE_GRPC = prev;
  }
}

export async function connectUpstream(
  upstream: UpstreamOptions,
  options?: {
    /** Bind for scaffolded gRPC when upstream is stdio/HTTP. `false` skips. */
    grpcListen?: string | false;
  }
): Promise<UpstreamConnection> {
  if (upstream.kind === "grpc") {
    const address = upstream.address.trim();
    if (!address) throw new Error("gRPC upstream requires a non-empty address");
    const tools = await listToolsUnaryGrpc({
      address,
      protocolVersion: upstream.protocolVersion,
    });
    const createBridgedMcpServer = () => {
      const mcp = newBridgeServer("mcp-api-adapter-bridge");
      wireGrpcDelegationHandlers(mcp.server, {
        address,
        protocolVersion: upstream.protocolVersion,
      });
      return mcp;
    };
    const connection: UpstreamConnection = {
      kind: "grpc",
      label: address,
      tools,
      callTool: (tool, args) =>
        callToolViaGrpc({
          grpcAddress: address,
          tool,
          arguments: args,
          protocolVersion: upstream.protocolVersion,
        }),
      grpcAddress: address,
      localGrpc: false,
      createBridgedMcpServer,
      refreshTools: async () => {
        connection.tools = await listToolsUnaryGrpc({
          address,
          protocolVersion: upstream.protocolVersion,
        });
        return connection.tools;
      },
      close: async () => undefined,
    };
    return connection;
  }

  const client = new Client({ name: "mcp-api-adapter", version: ADAPTER_VERSION });
  let label: string;
  let kind: UpstreamKind;
  let closeTransport: () => Promise<void> = async () => undefined;

  if (upstream.kind === "http") {
    kind = "http";
    label = upstream.url.trim();
    if (!label) throw new Error("HTTP upstream requires a non-empty url");
    const transport = new StreamableHTTPClientTransport(new URL(label));
    await client.connect(transport);
    closeTransport = async () => {
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
    };
  } else {
    kind = "stdio";
    const command = upstream.command.trim();
    if (!command) throw new Error("stdio upstream requires a command");
    const args = upstream.args ?? [];
    label = [command, ...args].join(" ");
    const transport = new StdioClientTransport({
      command,
      args,
      env: upstream.env
        ? ({ ...process.env, ...upstream.env } as Record<string, string>)
        : undefined,
      stderr: "inherit",
    });
    await client.connect(transport);
    closeTransport = async () => {
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
    };
  }

  const listed = await client.listTools();
  const tools = asListedTools(listed.tools ?? []);

  const callTool: CallToolFn = async (tool, args) => {
    const result = await client.callTool({
      name: tool.name,
      arguments: args ?? {},
    });
    const collapsed = collapseSdkToolResult(result);
    if (collapsed.isError) {
      const err = new Error(collapsed.text || `MCP tool ${tool.name} returned isError`);
      (err as Error & { result?: typeof collapsed }).result = collapsed;
      throw err;
    }
    return collapsed;
  };

  const createBridgedMcpServer = () => {
    const mcp = newBridgeServer("mcp-api-adapter-bridge");
    wireDelegationHandlers(mcp.server, client);
    return mcp;
  };

  let grpcAddress: string | undefined;
  let localGrpc = false;
  let grpcServer: StartedGrpcServer | undefined;

  const grpcListen = options?.grpcListen;
  if (grpcListen !== false) {
    const listen = (typeof grpcListen === "string" && grpcListen.trim()) || "127.0.0.1:0";
    grpcServer = await scaffoldLocalGrpc(createBridgedMcpServer, listen);
    if (grpcServer) {
      grpcAddress = grpcServer.address;
      localGrpc = true;
    }
  }

  const connection: UpstreamConnection = {
    kind,
    label,
    tools,
    callTool,
    grpcAddress,
    localGrpc,
    createBridgedMcpServer,
    refreshTools: async () => {
      const next = await client.listTools();
      connection.tools = asListedTools(next.tools ?? []);
      return connection.tools;
    },
    close: async () => {
      if (grpcServer) await grpcServer.shutdown();
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      await closeTransport();
    },
  };
  return connection;
}
