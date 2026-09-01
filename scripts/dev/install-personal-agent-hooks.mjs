#!/usr/bin/env node
/**
 * Install Hermes WORM agent + Cline MCP/hooks from clawql-agents.
 * Env: HERMES_EXTENSIONS_DIR, CLINE_CONFIG_PATH, CLAWQL_MCP_URL, CLAWQL_INFERENCE_URL, WORM_HTTP_ENDPOINT
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { installPersonalAgentHooks } from "../../packages/clawql-agents/dist/index.js";

const hermesExtensionsDir =
  process.env.HERMES_EXTENSIONS_DIR?.trim() ||
  join(homedir(), ".hermes/personal/extensions");
const clineConfigPath =
  process.env.CLINE_CONFIG_PATH?.trim() || join(homedir(), ".cline/config.json");
const mcpEndpoint = process.env.CLAWQL_MCP_URL?.trim() || "http://127.0.0.1:8080/mcp";
const inferenceEndpoint =
  process.env.CLAWQL_INFERENCE_URL?.trim() || "http://127.0.0.1:8091/v1";

const plan = await Effect.runPromise(
  installPersonalAgentHooks({
    hermesExtensionsDir,
    clineConfigPath,
    mcpEndpoint,
    inferenceEndpoint,
    wormHttpEndpoint: process.env.WORM_HTTP_ENDPOINT,
  })
);

console.log("Installed Hermes WORM agent →", plan.hermesWormAgentDest);
console.log("Wrote Cline config →", clineConfigPath);
console.log("Merge hermes.runtime.snippet.yaml into hermes.yaml (runtime_class).");
console.log("ATR Hermes tools:", plan.atr.hermes.toolsInScope.join(", "));
console.log("ATR Cline tools:", plan.atr.cline.toolsInScope.join(", "));
