/**
 * Panguard MCP proxy plugin (effect-ts plan Phase 3 / #308).
 * Registers as first-class `mcp-proxy` plugin; sidecar bridge remains until in-process cutover.
 * Denies dual-write to process `clawql-audit` WORM when enabled.
 */

import { appendProcessWormEffect, wormInputFromPanguardDeny } from "clawql-audit";
import { ClawQLError, type Plugin } from "clawql-core";
import { Effect } from "effect";

export type PanguardProxyPluginOptions = {
  /** When true, plugin is registered but does not intercept traffic (default sidecar path). */
  readonly passive?: boolean;
};

/** Default proxy plugin id — matches `packages/panguard-mcp-bridge` integration. */
export const PANGUARD_PROXY_PLUGIN_ID = "panguard-mcp-proxy";

export function panguardInProcessEnabled(): boolean {
  return process.env.CLAWQL_PANGUARD_IN_PROCESS?.trim() === "1";
}

/**
 * Factory for the Panguard gateway proxy plugin.
 * Active routing when `CLAWQL_PANGUARD_IN_PROCESS=1` (runs `beforeCallTool` hook).
 */
export function createPanguardProxyPlugin(options: PanguardProxyPluginOptions = {}): Plugin {
  const inProcess = panguardInProcessEnabled();
  const passive = options.passive ?? !inProcess;
  const plugin: Plugin = {
    id: PANGUARD_PROXY_PLUGIN_ID,
    version: "0.1.0",
    kind: "mcp-proxy",
    vertical: "security",
    onRegister: (_api) =>
      Effect.sync(() => {
        if (process.env.CLAWQL_PANGUARD_PROXY_DEBUG?.trim() === "1") {
          process.stderr.write(
            `[clawql-api] PanguardProxyPlugin registered (passive=${passive}, inProcess=${inProcess})\n`
          );
        }
      }),
  };

  if (!passive) {
    plugin.beforeCallTool = ({ toolName }) =>
      Effect.gen(function* () {
        const blocked = process.env.CLAWQL_PANGUARD_BLOCK_TOOLS?.trim();
        if (!blocked) return;
        const deny = blocked
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (deny.includes(toolName) || deny.includes("*")) {
          const reason = `Panguard policy blocked tool: ${toolName}`;
          yield* Effect.gen(function* () {
            const input = yield* wormInputFromPanguardDeny({ toolName, reason });
            yield* appendProcessWormEffect(input);
          }).pipe(Effect.catchAll(() => Effect.void));
          return yield* Effect.fail(new ClawQLError({ reason }));
        }
      });
  }

  return plugin;
}

/** Registered by default unless `CLAWQL_PANGUARD_PROXY_PLUGIN=0`. */
export function panguardProxyPluginEnabled(): boolean {
  return process.env.CLAWQL_PANGUARD_PROXY_PLUGIN?.trim() !== "0";
}

export function defaultPlugins(): readonly Plugin[] {
  return panguardProxyPluginEnabled() ? [createPanguardProxyPlugin()] : [];
}
