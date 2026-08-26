import {
  OUROBOROS_PLUGIN_ID,
  buildOuroborosMcpToolDefinitions,
  ensureOuroborosPoolShutdownHooks,
  type OuroborosToolDefOptions,
} from "clawql-ouroboros/plugin";
import { Effect } from "effect";
import { z } from "zod";
import type { HarnessContext, HarnessPlugin, LoopState } from "../../src/types.js";
import { HarnessPluginError } from "../../src/types.js";
import { personaForPattern } from "./personas.js";
import { StagnationPattern, stagnationPatternForState } from "./stagnation.js";

export type OuroborosHarnessPluginOptions = OuroborosToolDefOptions;

const ClawqlThinkSchema = z.object({
  reasoning: z.string().optional(),
});

const mcpResultToHarnessValue = (result: {
  content: readonly { type: "text"; text: string }[];
}): unknown => {
  const text = result.content[0]?.text;
  if (text === undefined) return result;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
};

/**
 * Harness plugin that owns the Ouroboros surface:
 * - `clawql_think` + Wonder/Reflect evaluate hooks
 * - full `ouroboros_*` tool set (shared defs from `clawql-ouroboros`)
 *
 * MCP enablement = include this plugin in `ClawQLHarness.create({ plugins })`
 * (bridged via `makeHarnessLayer`). No separate MCP registration path.
 */
export function createOuroborosHarnessPlugin(
  options: OuroborosHarnessPluginOptions = {}
): HarnessPlugin {
  return {
    id: OUROBOROS_PLUGIN_ID,
    version: "0.2.0",

    setup: (ctx: HarnessContext) =>
      Effect.gen(function* () {
        ensureOuroborosPoolShutdownHooks();

        ctx.tools.register({
          name: "clawql_think",
          description:
            "Structured reasoning scratchpad — dump current reasoning before deciding the next action.",
          inputSchema: ClawqlThinkSchema.shape,
          handler: (args) =>
            Effect.gen(function* () {
              const reasoning =
                typeof args.reasoning === "string" ? args.reasoning : JSON.stringify(args);
              yield* ctx.worm.append({
                type: "AGENT_ACTION",
                agentName: "harness-ouroboros",
                metadata: {
                  harnessEvent: "OUROBOROS_THINK",
                  content: reasoning,
                },
              });
              return { acknowledged: true };
            }),
        });

        for (const tool of buildOuroborosMcpToolDefinitions(options)) {
          ctx.tools.register({
            name: tool.name,
            description: tool.description ?? tool.name,
            inputSchema: tool.schema,
            handler: (args) =>
              Effect.tryPromise({
                try: async () => mcpResultToHarnessValue(await tool.handler(args)),
                catch: (err) =>
                  new HarnessPluginError({
                    pluginId: OUROBOROS_PLUGIN_ID,
                    reason: err instanceof Error ? err.message : String(err),
                    cause: err,
                  }),
              }),
          });
        }

        ctx.loop.onEvaluate((state: LoopState) =>
          Effect.gen(function* () {
            const pattern = stagnationPatternForState(state);
            if (pattern === StagnationPattern.NONE) {
              return state;
            }
            const persona = personaForPattern(pattern);
            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-ouroboros",
              metadata: {
                harnessEvent: "OUROBOROS_STAGNATION_DETECTED",
                pattern,
                personaApplied: persona.name,
              },
            });
            return {
              ...state,
              systemPromptAddendum: persona.reframingPrompt,
              wonderTriggered: true,
              history: [
                ...state.history,
                {
                  turn: state.turn,
                  phase: "evaluate" as const,
                  ontologySnapshot: `wonder:${persona.name}`,
                  note: persona.reframingPrompt.slice(0, 120),
                },
              ],
            };
          })
        );

        yield* Effect.void;
      }),

    teardown: (ctx: HarnessContext) =>
      Effect.gen(function* () {
        yield* ctx.worm.append({
          type: "AGENT_ACTION",
          agentName: "harness-ouroboros",
          metadata: { harnessEvent: "OUROBOROS_SESSION_END" },
        });
      }),
  };
}

/** Default harness Ouroboros plugin (no Langfuse eval tool). */
export const OuroborosPlugin: HarnessPlugin = createOuroborosHarnessPlugin();
