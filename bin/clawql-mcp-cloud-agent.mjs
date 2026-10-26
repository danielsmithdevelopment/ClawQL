#!/usr/bin/env node
/**
 * Cloud Agent stdio MCP launcher: map Cursor Secrets (CLOUDFLARE_*) to ClawQL
 * sync env names, then start the workspace clawql-mcp binary.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;

env.CLAWQL_HOME ??= env.HOME ? `${env.HOME}/.ClawQL` : "/home/ubuntu/.ClawQL";
env.CLAWQL_OBSIDIAN_VAULT_PATH ??= env.CLAWQL_HOME;
env.CLAWQL_ENABLE_MEMORY ??= "1";
env.CLAWQL_BUNDLED_OFFLINE ??= "1";
env.CLAWQL_SYNC_PROVIDER ??= "r2";
env.CLAWQL_SYNC_AUTO ??= "1";
env.CLAWQL_SYNC_AUTO_PULL ??= "1";
env.CLAWQL_SYNC_AUTO_PULL_ON_START ??= "1";

env.CLAWQL_R2_ACCOUNT_ID ??=
  env.CLAWQL_CLOUDFLARE_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID ?? "";
env.CLAWQL_SYNC_ACCESS_KEY_ID ??=
  env.R2_ACCESS_KEY_ID ?? env.CLOUDFLARE_ACCESS_KEY_ID ?? "";
env.CLAWQL_SYNC_SECRET_ACCESS_KEY ??=
  env.R2_SECRET_ACCESS_KEY ?? env.CLOUDFLARE_SECRET_ACCESS_KEY ?? "";

const dir = dirname(fileURLToPath(import.meta.url));
const { startStdioMcpServer } = await import(join(dir, "../dist/server.js"));
await startStdioMcpServer();
