/**
 * Panguard MCP proxy plugin (effect-ts plan Phase 3 / #308).
 * Registers as first-class `mcp-proxy` plugin; sidecar bridge remains until in-process cutover.
 */

import type { Plugin } from "clawql-core";
import { Effect } from "effect";

export type PanguardProxyPluginOptions = {
  /** When true, plugin is registered but does not intercept traffic (default sidecar path). */
  readonly passive?: boolean;
};

/** Default proxy plugin id — matches `packages/panguard-mcp-bridge` integration. */
export const PANGUARD_PROXY_PLUGIN_ID = "panguard-mcp-proxy";

/**
 * Factory for the Panguard gateway proxy plugin.
 * `onRegister` is a no-op stub until proxy routing moves from the bridge binary into clawql-api.
 */
export function createPanguardProxyPlugin(options: PanguardProxyPluginOptions = {}): Plugin {
  const passive = options.passive ?? true;
  return {
    id: PANGUARD_PROXY_PLUGIN_ID,
    version: "0.1.0",
    kind: "mcp-proxy",
    vertical: "security",
    onRegister: () =>
      Effect.sync(() => {
        if (process.env.CLAWQL_PANGUARD_PROXY_DEBUG?.trim() === "1") {
          process.stderr.write(
            `[clawql-api] PanguardProxyPlugin registered (passive=${passive})\n`
          );
        }
      }),
  };
}

/** Registered by default unless `CLAWQL_PANGUARD_PROXY_PLUGIN=0`. */
export function panguardProxyPluginEnabled(): boolean {
  return process.env.CLAWQL_PANGUARD_PROXY_PLUGIN?.trim() !== "0";
}

export function defaultPlugins(): readonly Plugin[] {
  return panguardProxyPluginEnabled() ? [createPanguardProxyPlugin()] : [];
}
