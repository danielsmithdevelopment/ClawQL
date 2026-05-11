/**
 * Verify Streamable HTTP MCP exposes ClawQL Core tools (audit + cache) and audit.call works.
 * Use after local-k8s-up when Cursor shows a thin tool list — often a stale :latest digest on the node.
 *
 * Usage (repo root):
 *   npx tsx scripts/dev/verify-mcp-streamable-core-tools.ts
 *   CLAWQL_MCP_HTTP_URL=http://clawql-mcp.localhost/mcp npx tsx scripts/dev/verify-mcp-streamable-core-tools.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES } from "../../src/mcp-nonnegotiable-tools.js";

const url = (process.argv[2] || process.env.CLAWQL_MCP_HTTP_URL || "http://127.0.0.1/mcp").trim();

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "verify-mcp-core-tools", version: "1.0.0" }, {});
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    const missing: string[] = [];
    for (const required of CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES) {
      if (!names.has(required)) missing.push(required);
    }
    if (missing.length) {
      console.error(
        `FAIL: ${url} tools/list missing Core tool(s): ${missing.join(", ")}. ` +
          `Got ${tools.length} tools: ${[...names].sort().join(", ")}. ` +
          `Try: kubectl -n clawql rollout restart deployment/clawql-mcp-http`
      );
      process.exit(1);
    }
    const append = await client.callTool({
      name: "audit",
      arguments: {
        operation: "append",
        category: "verify",
        action: "verify_mcp_streamable_core_tools",
        summary: "scripts/dev/verify-mcp-streamable-core-tools.ts",
      },
    });
    if (append.isError) {
      console.error("FAIL: audit append returned isError", append);
      process.exit(1);
    }
    const listed = await client.callTool({
      name: "audit",
      arguments: { operation: "list", limit: 5 },
    });
    if (listed.isError) {
      console.error("FAIL: audit list returned isError", listed);
      process.exit(1);
    }
    console.log(`OK: ${url} — Core tools present (${tools.length} total); audit append/list succeeded.`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
