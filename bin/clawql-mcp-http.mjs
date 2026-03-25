#!/usr/bin/env node
/**
 * CLI entry for the MCP server over Streamable HTTP.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
await import(join(dir, "../dist/server-http.js"));
