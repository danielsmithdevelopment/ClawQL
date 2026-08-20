#!/usr/bin/env node
/**
 * Harvey LAB ClawQL tool execution via MCP (stdin JSON args → stdout text/json).
 *
 * Usage:
 *   echo '{"sql":"SELECT 1"}' | node lab-mcp-proxy.mjs clawql_sql
 *   node lab-mcp-proxy.mjs --audit-start   # LAB_RUN_START audit line
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LabMcpClient, mcpToolText } from "./lab-mcp-client.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const toolsJsonPath =
  process.env.CLAWQL_LAB_TOOLS_JSON ??
  join(__dir, "..", "harness", "adapters", "clawql_tools.json");

/** @type {{ mcp_map: Record<string, string> }} */
const { mcp_map: MCP_MAP } = JSON.parse(readFileSync(toolsJsonPath, "utf8"));

const MAX_JSON_CHARS = Number.parseInt(process.env.CLAWQL_LAB_CLAWQL_TOOL_JSON_CHARS ?? "100000", 10);

function mapTool(clawqlName) {
  if (MCP_MAP[clawqlName]) return MCP_MAP[clawqlName];
  if (clawqlName.startsWith("clawql_")) return clawqlName.slice("clawql_".length);
  return clawqlName;
}

function normalizeArgs(toolName, args) {
  const out = { ...args };
  if (toolName === "clawql_sql" || toolName === "clawql_duckdb_query") {
    const sql = String(out.sql ?? out.query ?? "");
    return { sql };
  }
  const mcp = mapTool(toolName);
  if (mcp === "memory_ingest") {
    if (out.content && !out.toolOutputs) out.toolOutputs = out.content;
    delete out.content;
    if (!out.type) out.type = "context";
  }
  return out;
}

async function auditStart() {
  const client = new LabMcpClient();
  const task = process.env.CLAWQL_LAB_TASK_ID ?? "unknown";
  const arm = process.env.CLAWQL_LAB_ARM ?? "clawql";
  const model = process.env.CLAWQL_LAB_MODEL ?? "unknown";
  try {
    await client.callTool("audit", {
      operation: "append",
      category: "lab_run",
      action: "LAB_RUN_START",
      summary: `harvey-lab-${process.env.CLAWQL_LAB_STACK_VERSION ?? "ts-clawql-data-v2"} arm=${arm} model=${model} task=${task}`,
      correlationId: `harvey-lab:${task}:${arm}`,
    });
  } catch (err) {
    console.warn(`ClawQL audit LAB_RUN_START warning: ${err}`);
  }
}

async function runTool(toolName, rawArgs) {
  const client = new LabMcpClient();
  const mcpName = mapTool(toolName);
  let args = normalizeArgs(toolName, rawArgs);
  if (mcpName === "data_query") {
    args = { sql: String(args.sql ?? "") };
  }
  const result = await client.callTool(mcpName, args);
  let text =
    mcpName === "data_query" || toolName === "clawql_sql" || toolName === "clawql_duckdb_query"
      ? mcpToolText(result)
      : JSON.stringify(result, null, 2);
  if (text.length > MAX_JSON_CHARS) {
    text = `${text.slice(0, MAX_JSON_CHARS)}\n…[ClawQL tool JSON truncated]`;
  }
  process.stdout.write(text);
}

async function main() {
  const toolName = process.argv[2];
  if (!toolName) {
    console.error("Usage: node lab-mcp-proxy.mjs <clawql_tool_name>  (args on stdin as JSON)");
    console.error("       node lab-mcp-proxy.mjs --audit-start");
    process.exit(1);
  }
  if (toolName === "--audit-start") {
    await auditStart();
    return;
  }
  const stdin = await new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      buf += c;
    });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
  let args = {};
  if (stdin.trim()) {
    args = JSON.parse(stdin);
  }
  try {
    await runTool(toolName, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (toolName === "clawql_sql" || toolName === "clawql_duckdb_query") {
      process.stdout.write(JSON.stringify({ ok: false, error: msg }));
    } else {
      process.stdout.write(`Error calling ClawQL MCP tool: ${msg}`);
    }
    process.exit(1);
  }
}

main();
