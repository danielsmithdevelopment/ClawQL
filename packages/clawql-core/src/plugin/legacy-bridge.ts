/**
 * Bridge legacy Phase-2 `Plugin` (+ beforeCallTool) → ProviderPlugin.
 * @deprecated Prefer authoring ProviderPlugin directly (ClawQL 8.0).
 */

import { Effect } from "effect";
import { ClawQLError } from "../errors/clawql-error.js";
import { defaultInstallEffect, defaultUninstallEffect } from "./plugin-installer.js";
import type { Plugin } from "./types.js";
import type { HookContext, HookResult, ProviderPlugin } from "./provider-types.js";

/**
 * Map a legacy `Plugin` to a `ProviderPlugin`.
 * - `onRegister` tools are registered during install via a one-shot registration pass
 * - `beforeCallTool` becomes a blocking `tool`/`pre-execute` hook (pattern `.*`)
 */
export function legacyPluginToProviderPlugin(legacy: Plugin): ProviderPlugin {
  const hooks =
    legacy.kind === "mcp-proxy" && legacy.beforeCallTool
      ? [
          {
            id: `${legacy.id}:beforeCallTool`,
            scope: "tool" as const,
            event: "pre-execute" as const,
            toolPattern: ".*",
            blocking: true,
            handler: (ctx: HookContext) =>
              Effect.gen(function* () {
                const before = legacy.beforeCallTool!;
                yield* before({
                  toolName: ctx.toolName ?? "",
                  args: ctx.args,
                }).pipe(
                  Effect.mapError(
                    (e) =>
                      new ClawQLError({
                        reason: e instanceof Error ? e.message : String(e),
                        cause: e,
                      })
                  )
                );
                const ok: HookResult = { allow: true };
                return ok;
              }),
          },
        ]
      : undefined;

  const plugin: ProviderPlugin = {
    id: legacy.id,
    version: legacy.version,
    description: `Legacy Plugin bridge (${legacy.kind ?? "default"})`,
    hooks,
    install: (ctx) =>
      Effect.gen(function* () {
        if (legacy.onRegister) {
          yield* legacy.onRegister(ctx.registrationApi);
        }
        yield* defaultInstallEffect(plugin, ctx);
      }),
    uninstall: (ctx) =>
      Effect.gen(function* () {
        if (legacy.onTeardown) {
          yield* legacy.onTeardown();
        }
        yield* defaultUninstallEffect(plugin, ctx);
      }),
  };

  return plugin;
}
