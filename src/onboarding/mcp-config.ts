/**
 * `clawql mcp-config` — print MCP client JSON (stdio; no secrets in output).
 */

import { getClawqlEnvFilePath, getClawqlHome } from "./paths.js";

export type McpConfigOptions = {
  transport?: "stdio" | "http";
  url?: string;
  /** Inject CLAWQL_HOME env into MCP server child process. */
  includeHomeEnv?: boolean;
};

export function buildMcpServerConfig(options: McpConfigOptions = {}): Record<string, unknown> {
  const transport = options.transport ?? "stdio";
  const home = getClawqlHome();
  const envFile = getClawqlEnvFilePath(home);

  if (transport === "http") {
    const url = options.url ?? process.env.CLAWQL_MCP_URL ?? "http://127.0.0.1:8080/mcp";
    return {
      mcpServers: {
        clawql: { url },
      },
    };
  }

  const env: Record<string, string> = {};
  if (options.includeHomeEnv !== false) {
    env.CLAWQL_HOME = home;
    // MCP child loads ~/.ClawQL/clawql.env + vault/providers.json via load-env.ts
  }

  return {
    mcpServers: {
      clawql: {
        command: "npx",
        // `npx -p clawql-mcp clawql-mcp` fails on many hosts with "clawql-mcp: not found".
        // `npx -y clawql-mcp` runs the package bin reliably (Cloud Agents / Automations).
        args: ["-y", "clawql-mcp"],
        ...(Object.keys(env).length ? { env } : {}),
      },
    },
    _clawql_note: `Provider secrets: ${home}/vault/providers.json (not in this JSON). Config: ${envFile}`,
  };
}

export function formatMcpConfig(options: McpConfigOptions = {}): string {
  const cfg = buildMcpServerConfig(options);
  return `${JSON.stringify(cfg, null, 2)}\n`;
}
