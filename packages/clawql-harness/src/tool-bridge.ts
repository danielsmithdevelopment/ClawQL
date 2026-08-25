import type { WORMAuditTrail } from "clawql-audit";
import { Effect } from "effect";
import type { HarnessRegistryState } from "./registry.js";
import type { HarnessPluginError, HarnessTool } from "./types.js";
import { HarnessPluginError as HarnessPluginErrorClass } from "./types.js";

/** In-process harness tool catalog (not ClawQL MCP until bridged externally). */
export const listHarnessTools = (state: HarnessRegistryState): readonly HarnessTool[] =>
  [...state.tools.values()];

export const invokeHarnessTool = (
  state: HarnessRegistryState,
  toolName: string,
  args: Record<string, unknown> = {}
): Effect.Effect<unknown, HarnessPluginError, WORMAuditTrail> =>
  Effect.gen(function* () {
    const tool = state.tools.get(toolName);
    if (!tool) {
      return yield* Effect.fail(
        new HarnessPluginErrorClass({
          pluginId: "clawql-harness",
          reason: `unknown harness tool: ${toolName}`,
        })
      );
    }
    return yield* tool.handler(args);
  });

/**
 * Names suitable for documentation / future MCP bridge registration.
 * Harness tools remain harness-local until explicitly bridged.
 */
export const harnessToolNamesForMcpBridge = (state: HarnessRegistryState): readonly string[] =>
  listHarnessTools(state).map((t) => t.name);
