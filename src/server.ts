/**
 * Published stdio MCP entry (`dist/server.js`). Implementation: `./mcp/stdio-main.ts`.
 */
import "./host/load-env.js";
import { pathToFileURL } from "node:url";
export { startStdioMcpServer } from "./mcp/stdio-main.js";
import { startStdioMcpServer } from "./mcp/stdio-main.js";

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startStdioMcpServer().catch((err) => {
    console.error("[cloudrun-mcp] Fatal error during startup:", err);
    process.exit(1);
  });
}
