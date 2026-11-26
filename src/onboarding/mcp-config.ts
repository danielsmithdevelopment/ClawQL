/**
 * `clawql mcp-config` — print MCP client JSON (stdio; no secrets in output).
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { NPM_PACKAGE_VERSION } from "../host/npm-version.js";
import { getClawqlEnvFilePath, getClawqlHome } from "./paths.js";

export type McpConfigOptions = {
  transport?: "stdio" | "http";
  url?: string;
  /** Inject CLAWQL_HOME env into MCP server child process. */
  includeHomeEnv?: boolean;
};

export type McpLaunchCommand = {
  readonly command: string;
  readonly args: readonly string[];
};

/** Candidate paths for a locally built / installed `clawql-mcp` entry (no network). */
export function localClawqlMcpBinaryCandidates(
  argv1: string | undefined = process.argv[1],
  envBin: string | undefined = process.env.CLAWQL_BIN
): string[] {
  const out: string[] = [];
  const push = (p: string | undefined) => {
    const t = p?.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  const fromBin = envBin?.trim();
  if (fromBin?.endsWith("clawql.mjs")) {
    push(fromBin.replace(/clawql\.mjs$/, "clawql-mcp.mjs"));
  }
  if (typeof argv1 === "string" && argv1.endsWith("clawql.mjs")) {
    push(argv1.replace(/clawql\.mjs$/, "clawql-mcp.mjs"));
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    push(join(here, "..", "..", "bin", "clawql-mcp.mjs"));
    push(join(here, "..", "bin", "clawql-mcp.mjs"));
  } catch {
    /* CJS / odd hosts */
  }
  push(join(process.cwd(), "bin", "clawql-mcp.mjs"));
  return out;
}

/** First existing local MCP binary, or null. */
export function resolveLocalClawqlMcpBinary(argv1?: string, envBin?: string): string | null {
  for (const p of localClawqlMcpBinaryCandidates(argv1, envBin)) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Prefer the local CLI binary; otherwise pin `npx` to the running package version
 * so every start does not float to unpinned `clawql-mcp` from npm (audit 2.14).
 */
export function resolvePinnedClawqlMcpLaunch(argv1?: string, envBin?: string): McpLaunchCommand {
  const local = resolveLocalClawqlMcpBinary(argv1, envBin);
  if (local) {
    return { command: "node", args: [local] };
  }
  const version = NPM_PACKAGE_VERSION || "8.0.0";
  return { command: "npx", args: ["-y", `clawql-mcp@${version}`] };
}

export function resolvePinnedClawqlMcpLaunchEffect(
  argv1?: string,
  envBin?: string
): Effect.Effect<McpLaunchCommand> {
  return Effect.sync(() => resolvePinnedClawqlMcpLaunch(argv1, envBin));
}

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
  }

  const launch = resolvePinnedClawqlMcpLaunch();
  return {
    mcpServers: {
      clawql: {
        command: launch.command,
        args: [...launch.args],
        ...(Object.keys(env).length ? { env } : {}),
      },
    },
    _clawql_note: `Provider secrets: ${home}/vault/providers.json (not in this JSON). Config: ${envFile}`,
  };
}

export function buildMcpServerConfigEffect(
  options: McpConfigOptions = {}
): Effect.Effect<Record<string, unknown>> {
  return Effect.sync(() => buildMcpServerConfig(options));
}

export function formatMcpConfig(options: McpConfigOptions = {}): string {
  const cfg = buildMcpServerConfig(options);
  return `${JSON.stringify(cfg, null, 2)}\n`;
}
