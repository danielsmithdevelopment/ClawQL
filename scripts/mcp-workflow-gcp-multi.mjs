#!/usr/bin/env node
/**
 * GCP multi-spec workflow via **real MCP stdio** (spawns `dist/server.js`, uses `tools/call` → `search`).
 * Captures the full `CallToolResult` envelope + parsed JSON body (what Cursor/Claude see).
 *
 * Usage:
 *   npm run workflow:gcp-multi
 *
 * Env (inherited; defaults shown):
 *   CLAWQL_GOOGLE_TOP20_SPECS=1  CLAWQL_BUNDLED_OFFLINE=1
 *
 * Output: docs/workflow-gcp-multi-latest.json
 */

import { writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Ordered intents aligned with docs/workflow-gcp-multi-service.md sections. */
const WORKFLOW_QUERIES = [
  {
    section: "0. Service Usage — enable APIs",
    query: "batch enable services projects serviceusage",
  },
  {
    section: "1. Resource Manager — project IAM",
    query: "get IAM policy project set bindings cloudresourcemanager",
  },
  {
    section: "2. Networking & firewall",
    query: "compute firewall insert network subnet VPC ingress",
  },
  {
    section: "3. GKE cluster",
    query: "create kubernetes cluster regional container locations",
  },
  {
    section: "4. Logging",
    query: "logging sink create export logs BigQuery storage destination",
  },
  {
    section: "5. Monitoring",
    query: "monitoring alert policy notification channel time series",
  },
  {
    section: "6. Load balancing (Compute)",
    query: "global forwarding rule backend service health check url map HTTPS proxy",
  },
  {
    section: "7. Cloud DNS",
    query: "DNS managed zone resource record set create A record",
  },
  {
    section: "8. Cloud Storage",
    query: "storage bucket insert objects upload IAM policy",
  },
  {
    section: "9. BigQuery",
    query: "BigQuery dataset query job insert table",
  },
];

const CROSS_CUTTING_QUERY =
  "enable APIs batch GKE cluster firewall logging monitoring DNS bucket BigQuery";

/** JSON-serializable view of MCP `CallToolResult` (content blocks are plain objects). */
function serializeMcpToolResult(result) {
  return {
    isError: result.isError ?? false,
    structuredContent: result.structuredContent ?? null,
    content: (result.content ?? []).map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      return block;
    }),
  };
}

async function main() {
  const serverLogs = [];
  const childEnv = { ...process.env };
  childEnv.CLAWQL_GOOGLE_TOP20_SPECS = process.env.CLAWQL_GOOGLE_TOP20_SPECS ?? "1";
  childEnv.CLAWQL_BUNDLED_OFFLINE = process.env.CLAWQL_BUNDLED_OFFLINE ?? "1";
  delete childEnv.CLAWQL_PROVIDER;
  delete childEnv.CLAWQL_SPEC_PATH;
  delete childEnv.CLAWQL_DISCOVERY_URL;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env: childEnv,
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      serverLogs.push(chunk.toString());
    });
  }

  const client = new Client(
    { name: "clawql-gcp-multi-workflow", version: "1.0.0" },
    {}
  );

  await client.connect(transport);

  async function mcpSearch(query, limit) {
    const result = await client.callTool({
      name: "search",
      arguments: { query, limit },
    });
    // Full fidelity: same object shape as MCP `tools/call` returns (text block =
    // `formatSearchResults` JSON). Clients: `JSON.parse(result.content[0].text)`.
    return {
      mcpCallToolResult: serializeMcpToolResult(result),
    };
  }

  const cross = await mcpSearch(CROSS_CUTTING_QUERY, 10);
  const workflowSteps = [];
  for (const step of WORKFLOW_QUERIES) {
    workflowSteps.push({
      section: step.section,
      query: step.query,
      ...(await mcpSearch(step.query, 5)),
    });
  }

  await client.close();

  let stderrJoined = serverLogs.join("");
  const mergedOperationCountMatch = stderrJoined.match(
    /Multi-spec: \d+ APIs merged → (\d+) operations/
  );
  const mergedOperationCount = mergedOperationCountMatch
    ? Number(mergedOperationCountMatch[1])
    : null;

  // Portable paths in committed JSON (avoid machine-specific node / home paths).
  stderrJoined = stderrJoined.split(ROOT).join("<CLAWQL_ROOT>");

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      transport: "mcp-stdio",
      note:
        "Each mcpCallToolResult is the real `tools/call` response. For `search`, " +
        "parse `content[].text` (JSON) to get `{ results: [...] }`.",
      serverSpawn: {
        command: "node",
        args: [relative(ROOT, join(ROOT, "dist/server.js"))],
        cwd: "<CLAWQL_ROOT> (package root — parent of package.json)",
      },
      clientInfo: { name: "clawql-gcp-multi-workflow", version: "1.0.0" },
      env: {
        CLAWQL_GOOGLE_TOP20_SPECS: process.env.CLAWQL_GOOGLE_TOP20_SPECS ?? "1",
        CLAWQL_BUNDLED_OFFLINE: process.env.CLAWQL_BUNDLED_OFFLINE ?? "1",
      },
      mergedOperationCount,
      serverStderrTail: stderrJoined.slice(-12000),
    },
    crossCutting: {
      query: CROSS_CUTTING_QUERY,
      ...cross,
    },
    workflowSteps,
  };

  const dest = join(ROOT, "docs", "workflow-gcp-multi-latest.json");
  await writeFile(dest, JSON.stringify(out, null, 2), "utf-8");

  console.log(JSON.stringify(out, null, 2));
  console.error(`\n[mcp-workflow-gcp-multi] Wrote ${dest} (MCP tools/call → search)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
