import { ClawQLApi, ExecuteService, SearchService } from "clawql-api";
import type {
  ClawQLError,
  McpToolAlreadyRegisteredError,
  Plugin,
  PluginAlreadyRegisteredError,
} from "clawql-core";
import {
  configureOuroborosPluginDeps,
  OUROBOROS_PLUGIN_ID,
  resetOuroborosContextForTests,
} from "clawql-ouroboros/plugin";
import { Effect, Layer } from "effect";
import { z } from "zod";
import { createClawQLHarness, type ClawQLHarness } from "./harness.js";
import { listHarnessTools, invokeHarnessTool } from "./tool-bridge.js";
import type { HarnessPlugin, ModelConfig } from "./types.js";
import { HarnessPluginError } from "./types.js";
import type { WormStorageError } from "clawql-audit";

const EmptyToolSchema = z.object({});

export type HarnessLayerError =
  | PluginAlreadyRegisteredError
  | ClawQLError
  | McpToolAlreadyRegisteredError
  | HarnessPluginError
  | WormStorageError
  | Error;

export type MakeHarnessLayerOptions = {
  readonly plugins: readonly HarnessPlugin[];
  readonly model?: ModelConfig;
  readonly wormDbPath?: string;
  readonly sessionId?: string;
};

const HARNESS_MCP_PLUGIN_ID = "clawql-harness";

let activeHarness: ClawQLHarness | null = null;

/** Test helper — clear bridged harness singleton. */
export function resetHarnessMcpBridgeForTests(): void {
  activeHarness = null;
  resetOuroborosContextForTests();
}

/**
 * Effect Layer: start `ClawQLHarness` with the given plugins and bridge every
 * registered harness tool onto the MCP tool registry via clawql-core Plugin API.
 *
 * This is the MCP enablement path for harness plugins (including Ouroboros).
 */
export function makeHarnessLayer(
  options: MakeHarnessLayerOptions
): Layer.Layer<never, HarnessLayerError, ClawQLApi | SearchService | ExecuteService> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const includesOuroboros = options.plugins.some((p) => p.id === OUROBOROS_PLUGIN_ID);
      if (includesOuroboros) {
        const search = yield* SearchService;
        const execute = yield* ExecuteService;
        configureOuroborosPluginDeps({
          search: (params) =>
            Effect.runPromise(search.search(params)).then(({ formattedText }) => ({
              content: [{ type: "text" as const, text: formattedText }],
            })),
          execute: (params) =>
            Effect.runPromise(execute.execute(params)).then((result) => ({
              content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
            })),
        });
      }

      const harness = yield* createClawQLHarness({
        plugins: options.plugins,
        model: options.model ?? { provider: "mcp", name: "clawql-mcp" },
        wormDbPath: options.wormDbPath,
        sessionId: options.sessionId,
      });
      activeHarness = harness;

      const claw = yield* ClawQLApi;
      const bridgePlugin: Plugin = {
        id: HARNESS_MCP_PLUGIN_ID,
        version: "0.1.0",
        kind: "default",
        onRegister: (api) =>
          Effect.gen(function* () {
            for (const tool of listHarnessTools(harness.state)) {
              yield* api.registerMcpTool({
                name: tool.name,
                description: tool.description,
                schema: tool.inputSchema ?? EmptyToolSchema.shape,
                handler: async (args) => {
                  const value = await Effect.runPromise(
                    invokeHarnessTool(
                      harness.state,
                      tool.name,
                      (args ?? {}) as Record<string, unknown>
                    ).pipe(Effect.provide(harness.layer))
                  );
                  return {
                    content: [
                      {
                        type: "text" as const,
                        text: typeof value === "string" ? value : JSON.stringify(value),
                      },
                    ],
                  };
                },
              });
            }
          }),
        onTeardown: () =>
          Effect.gen(function* () {
            yield* harness.teardown().pipe(Effect.catchAll(() => Effect.void));
            if (activeHarness === harness) activeHarness = null;
            if (includesOuroboros) {
              resetOuroborosContextForTests();
            }
          }),
      };

      yield* claw.registerPlugin(bridgePlugin);
    })
  );
}
