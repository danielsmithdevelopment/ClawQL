/**
 * Published Streamable HTTP MCP entry (`dist/server-http.js`).
 * Implementation: `./http/mcp-http-server.ts`.
 */
import "./host/load-env.js";
import { pathToFileURL } from "node:url";
export {
  createMcpHttpApp,
  createInferenceVirtualKeyClaimsResolver,
  startMcpHttpServer,
  type CreateMcpHttpAppOptions,
} from "./http/mcp-http-server.js";
import { startMcpHttpServer } from "./http/mcp-http-server.js";

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
  startMcpHttpServer().catch((err) => {
    console.error("[clawql-mcp-http] Fatal startup error:", err);
    process.exit(1);
  });
}
