#!/usr/bin/env node
/**
 * Docs Agent Lab MCP upstream for Act 2 (`/mcp-ui/presets/agent-lab`).
 *
 * Exposes docs_* tools that mirror docs-site WebMCP (clawql.docs.*) so
 * mcp-api-adapter can HTMX-scaffold a multi-step view that does **not** exist
 * as a static page on the docs site.
 *
 * From repo root:
 *   npm run build -w mcp-grpc-transport -w mcp-api-adapter
 *   node examples/mcp-api-adapter/docs-agent-lab-server.mjs
 *   open http://127.0.0.1:8091/mcp-ui/presets/agent-lab
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { startMcpApiAdapter } from "mcp-api-adapter";

const HUB_ROUTES = [
  { path: "/quickstart", title: "Quickstart" },
  { path: "/agent-setup", title: "Agent setup" },
  { path: "/learn/memory", title: "Learn · Memory" },
  { path: "/mcp/mcp-ui", title: "MCP UI" },
  { path: "/plugins", title: "Plugins" },
  { path: "/security", title: "Security" },
];

const DOC_HITS = [
  {
    path: "/mcp/mcp-ui",
    title: "/mcp-ui — Swagger UI for MCP",
    snippet: "HTMX playground from inputSchema; presets scaffold views that are not static docs pages.",
    kind: "guide",
  },
  {
    path: "/mcp/mcp-ui-three-act-demo",
    title: "Three-act demo",
    snippet: "WebMCP → custom /mcp-ui view → flamegraph. Act 2 is the Agent Lab preset.",
    kind: "demo",
  },
  {
    path: "/learn/streams/lab-5b",
    title: "Lab 5b — celld Helm",
    snippet: "Deploy celld with the Lab 5b Helm chart and verify Streams MCP fetch.",
    kind: "lab",
  },
  {
    path: "/learn/memory",
    title: "Memory vault",
    snippet: "memory_recall / memory_ingest against an Obsidian-compatible vault with OKF frontmatter.",
    kind: "guide",
  },
  {
    path: "/agent-setup",
    title: "Agent setup",
    snippet: "Wire Cursor / Claude / MCP clients to clawql-mcp without putting secrets in mcp.json.",
    kind: "quickstart",
  },
  {
    path: "/plugins",
    title: "Plugin registry",
    snippet: "Browse horizontal plugins — memory, documents, inference providers, and more.",
    kind: "registry",
  },
  {
    path: "/security/atr",
    title: "ATR scopes",
    snippet: "Capability tokens that gate which MCP tools an agent may call — including /mcp-ui execute.",
    kind: "security",
  },
  {
    path: "/mcp/mcp-api-adapter",
    title: "MCP API Adapter",
    snippet: "Seven surfaces from one catalog: OpenAPI, GraphQL, /mcp, gRPC, /ws, gen-cli, /mcp-ui.",
    kind: "guide",
  },
];

function createDocsAgentLabServer() {
  const server = new McpServer({
    name: "docs-agent-lab",
    version: "0.1.0",
  });

  server.tool(
    "docs_search",
    "Search curated ClawQL docs snippets (Agent Lab demo).",
    {
      query: z.string().describe("Keywords, e.g. celld, mcp-ui, memory"),
      limit: z.number().int().min(1).max(20).optional().describe("Max hits"),
    },
    async ({ query, limit }) => {
      const q = query.toLowerCase();
      const hits = DOC_HITS.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          h.snippet.toLowerCase().includes(q) ||
          h.path.includes(q)
      ).slice(0, limit ?? 8);
      const payload = {
        query,
        hits: hits.length ? hits : DOC_HITS.slice(0, limit ?? 6),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  server.tool(
    "docs_list_routes",
    "List curated documentation hub routes (Agent Lab demo).",
    {},
    async () => {
      const payload = { routes: HUB_ROUTES };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  server.tool(
    "docs_reveal_agent_lab",
    "Reveal the Agent Lab surface (demo unlock payload — not browser DOM).",
    {},
    async () => {
      const payload = {
        ok: true,
        unlocked: true,
        panelId: "clawql-agent-lab",
        tip: "On the docs site this unlocks the WebMCP panel; here it advances the /mcp-ui workflow.",
        next: "docs_claim_starter_pack",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  server.tool(
    "docs_claim_starter_pack",
    "Claim the starter pack (mcp.json + README stubs — no secrets).",
    {},
    async () => {
      const mcpJson = {
        mcpServers: {
          clawql: {
            command: "npx",
            args: ["-p", "clawql-mcp", "clawql-mcp"],
            env: {
              CLAWQL_HOME: "${HOME}/.ClawQL",
              CLAWQL_OBSIDIAN_VAULT_PATH: "${HOME}/.ClawQL",
            },
          },
        },
      };
      const payload = {
        ok: true,
        claimedAt: new Date().toISOString(),
        files: [
          {
            filename: "clawql-starter-mcp.json",
            bytes: JSON.stringify(mcpJson).length,
          },
          { filename: "CLAWQL-STARTER-README.md", bytes: 420 },
        ],
        mcpJson,
        warning: "Never put API tokens in mcp.json.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  return server;
}

async function main() {
  process.env.ENABLE_GRPC = process.env.ENABLE_GRPC || "1";
  process.env.ENABLE_GRPC_REFLECTION =
    process.env.ENABLE_GRPC_REFLECTION || "1";

  const grpcHost = process.env.GRPC_BIND?.trim() || "127.0.0.1";
  const grpcPort = process.env.GRPC_PORT?.trim() || "50052";
  const openApiHost = process.env.OPENAPI_HOST?.trim() || "127.0.0.1";
  const openApiPort = Number.parseInt(
    process.env.OPENAPI_PORT?.trim() || "8091",
    10
  );

  const grpc = await maybeStartGrpcMcpServer({
    createMcpServer: createDocsAgentLabServer,
    bindAddress: `${grpcHost}:${grpcPort}`,
  });
  if (!grpc) {
    throw new Error("gRPC did not start — set ENABLE_GRPC=1");
  }

  const gateway = await startMcpApiAdapter({
    upstream: { kind: "grpc", address: grpc.address },
    host: openApiHost,
    port: openApiPort,
    title: "Docs Agent Lab · MCP UI",
    serverName: "docs-agent-lab",
    apiKey: process.env.MCP_API_ADAPTER_API_KEY?.trim() || undefined,
    grpcListen: false,
  });

  console.log("");
  console.log("=== Docs Agent Lab (Act 2 /mcp-ui preset) ===");
  console.log(`gRPC MCP:     ${grpc.address}`);
  console.log(`OpenAPI:      ${gateway.url}`);
  console.log(`MCP UI:       ${gateway.url}/mcp-ui`);
  console.log(`Agent Lab:    ${gateway.url}/mcp-ui/presets/agent-lab`);
  console.log(
    `Tools:        ${gateway.getCatalog().tools.map((t) => t.name).join(", ")}`
  );
  console.log("");

  const shutdown = async () => {
    console.log("\nShutting down…");
    await gateway.close();
    await grpc.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
