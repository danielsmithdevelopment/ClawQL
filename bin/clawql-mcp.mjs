#!/usr/bin/env node
/**
 * CLI entry for the MCP server (stdio).
 * Installed via: npx clawql-mcp / npm i -g clawql-mcp-server
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
await import(join(dir, "../dist/server.js"));
