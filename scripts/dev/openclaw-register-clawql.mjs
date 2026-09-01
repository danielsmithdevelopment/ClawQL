#!/usr/bin/env node
/**
 * Print OpenClaw `mcp set` commands for ClawQL.
 * Usage: node scripts/dev/openclaw-register-clawql.mjs [http|stdio]
 */
import { Effect } from "effect";
import {
  formatOpenClawMcpSetCommands,
  OPENCLAW_ATR_TEMPLATES,
  planOpenClawLiveWiring,
} from "../../packages/clawql-agents/dist/index.js";

const mode = process.argv[2] === "stdio" ? "stdio" : "http";
const mcpEndpoint = process.env.CLAWQL_MCP_URL?.trim() || "http://127.0.0.1:8080/mcp";

const commands = await Effect.runPromise(
  formatOpenClawMcpSetCommands({ mode, mcpEndpoint })
);
for (const line of commands) console.log(line);

const plan = await Effect.runPromise(
  planOpenClawLiveWiring({
    mcpEndpoint,
    mode,
    atrScope: OPENCLAW_ATR_TEMPLATES.readonly_assistant,
    discoveredTools: [
      { name: "memory_recall", description: "Vault recall" },
      { name: "search", description: "API search" },
      { name: "execute", description: "API execute" },
    ],
  })
);
console.log(
  "# ATR skills in scope:",
  plan.skills.skills.map((s) => s.name).join(", ") || "(none)"
);
console.log(
  "# Skipped out of scope:",
  plan.skills.skippedOutOfScope.join(", ") || "(none)"
);
