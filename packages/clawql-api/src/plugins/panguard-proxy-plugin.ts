/**
 * Panguard MCP proxy ProviderPlugin — hooks-only enforcement (8.0 hard break).
 * Denies dual-write to process `clawql-audit` WORM when enabled.
 *
 * `clawql-audit` is dynamic-imported inside hook handlers so Ready listen does
 * not evaluate the WORM stack when Panguard is off (product default).
 */

import {
  defineProviderPlugin,
  type HookContext,
  type HookResult,
  type LifecycleHook,
  type ProviderPlugin,
} from "clawql-core";
import { Effect } from "effect";
import { loadClawqlAuditEffect } from "../audit/clawql-audit-lazy.js";
import { appendProcessWormGatedEffect } from "../audit/worm-append-gated.js";

export type PanguardProxyPluginOptions = {
  /** When true, plugin is registered but does not intercept traffic (default sidecar path). */
  readonly passive?: boolean;
};

/** Default proxy plugin id — matches `packages/panguard-mcp-bridge` integration. */
export const PANGUARD_PROXY_PLUGIN_ID = "panguard-mcp-proxy";

export function panguardInProcessEnabled(): boolean {
  return process.env.CLAWQL_PANGUARD_IN_PROCESS?.trim() === "1";
}

function atrBlockHook(): LifecycleHook {
  return {
    id: `${PANGUARD_PROXY_PLUGIN_ID}:pre-execute`,
    scope: "tool",
    event: "pre-execute",
    toolPattern: ".*",
    blocking: true,
    handler: (ctx: HookContext) =>
      Effect.gen(function* () {
        const toolName = ctx.toolName ?? "";
        const blocked = process.env.CLAWQL_PANGUARD_BLOCK_TOOLS?.trim();

        const recordAllow = Effect.gen(function* () {
          const audit = yield* loadClawqlAuditEffect();
          const input = yield* audit.wormInputFromPanguardAllow({ toolName });
          yield* appendProcessWormGatedEffect(input);
        });
        const recordDeny = (reason: string) =>
          Effect.gen(function* () {
            const audit = yield* loadClawqlAuditEffect();
            const input = yield* audit.wormInputFromPanguardDeny({ toolName, reason });
            // Deny decisions must be recorded when WORM is required (audit 3.02).
            yield* appendProcessWormGatedEffect(input);
          });

        if (!blocked) {
          const ok: HookResult = { allow: true };
          // Allow-path WORM is opt-in via CLAWQL_WORM_PANGUARD_ALLOW, except regulated
          // still fails closed if that env is set and the append fails.
          if (process.env.CLAWQL_WORM_PANGUARD_ALLOW?.trim() === "1") {
            yield* recordAllow;
          }
          return ok;
        }
        const deny = blocked
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (deny.includes(toolName) || deny.includes("*")) {
          const reason = `Panguard policy blocked tool: ${toolName}`;
          yield* recordDeny(reason);
          const denied: HookResult = { allow: false, denyReason: reason };
          return denied;
        }
        if (process.env.CLAWQL_WORM_PANGUARD_ALLOW?.trim() === "1") {
          yield* recordAllow;
        }
        const ok: HookResult = { allow: true };
        return ok;
      }),
  };
}

/**
 * Factory for the Panguard gateway ProviderPlugin.
 * Active routing when `CLAWQL_PANGUARD_IN_PROCESS=1` (blocking `pre-execute` hook).
 */
export function createPanguardProxyPlugin(
  options: PanguardProxyPluginOptions = {}
): ProviderPlugin {
  const inProcess = panguardInProcessEnabled();
  const passive = options.passive ?? !inProcess;

  if (process.env.CLAWQL_PANGUARD_PROXY_DEBUG?.trim() === "1") {
    process.stderr.write(
      `[clawql-api] PanguardProxyPlugin created (passive=${passive}, inProcess=${inProcess})\n`
    );
  }

  return defineProviderPlugin({
    id: PANGUARD_PROXY_PLUGIN_ID,
    version: "0.1.0",
    description: "Panguard ATR / tool-block enforcement (hooks-only ProviderPlugin)",
    hooks: passive ? undefined : [atrBlockHook()],
  });
}

/** Alias — same native ProviderPlugin (no legacy bridge). */
export function createPanguardProviderPlugin(
  options: PanguardProxyPluginOptions = {}
): ProviderPlugin {
  return createPanguardProxyPlugin(options);
}

/** Registered when `CLAWQL_PANGUARD_PROXY_PLUGIN=1` (8.0+ default off — opt in). */
export function panguardProxyPluginEnabled(): boolean {
  return process.env.CLAWQL_PANGUARD_PROXY_PLUGIN?.trim() === "1";
}

export function defaultPlugins(): readonly ProviderPlugin[] {
  return panguardProxyPluginEnabled() ? [createPanguardProxyPlugin()] : [];
}
