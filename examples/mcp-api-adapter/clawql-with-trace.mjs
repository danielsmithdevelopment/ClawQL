#!/usr/bin/env node
/**
 * Run mcp-api-adapter with live /mcp-ui/trace wired to a shared clawql-inference JSONL store.
 *
 * Prerequisites (repo root):
 *   npm install && npm run build -w clawql-inference -w mcp-api-adapter
 *
 * Usage:
 *   node examples/mcp-api-adapter/clawql-with-trace.mjs
 *
 * Then send inference with x-correlation-id (or correlationId in body) through clawql-inference;
 * open http://127.0.0.1:8090/mcp-ui/trace/<correlationId>
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const adapterBin = join(repoRoot, "packages/mcp-api-adapter/bin/mcp-api-adapter.mjs");

const traceDir = join(tmpdir(), "clawql-trace-demo");
const jsonlPath = join(traceDir, "calls.jsonl");

await mkdir(traceDir, { recursive: true });
if (!(await fileExists(jsonlPath))) {
  await writeFile(jsonlPath, "", "utf8");
}

const env = {
  ...process.env,
  MCP_API_ADAPTER_INFERENCE_TRACE: "1",
  CLAWQL_INFERENCE_STORE: "jsonl",
  CLAWQL_INFERENCE_STORE_PATH: jsonlPath,
};

console.log("[clawql-with-trace] shared inference store:", jsonlPath);
console.log("[clawql-with-trace] trace URL pattern: http://127.0.0.1:8090/mcp-ui/trace/<correlationId>");
console.log("[clawql-with-trace] compare fallback:   http://127.0.0.1:8090/mcp-ui/trace/compare");
console.log("");
console.log("Point --mcp-url at your ClawQL MCP server, e.g.:");
console.log("  CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp node examples/mcp-api-adapter/clawql-with-trace.mjs");
console.log("");

const mcpUrl = process.env.CLAWQL_MCP_URL?.trim();
const args = ["--listen", "0.0.0.0:8090"];
if (mcpUrl) {
  args.push("--mcp-url", mcpUrl);
} else {
  args.push("--stdio", "--", "npx", "-y", "@modelcontextprotocol/server-everything");
}

const child = spawn(process.execPath, [adapterBin, ...args], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
