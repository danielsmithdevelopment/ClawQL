import { Effect } from "effect";
import type { HarnessContext, HarnessPlugin, LoopState } from "../../src/types.js";
import { personaForPattern } from "./personas.js";
import { StagnationPattern, stagnationPatternForState } from "./stagnation.js";

export const OuroborosPlugin: HarnessPlugin = {
  id: "clawql-ouroboros",
  version: "0.2.0",

  setup: (ctx: HarnessContext) =>
    Effect.gen(function* () {
      ctx.tools.register({
        name: "clawql_think",
        description:
          "Structured reasoning scratchpad — dump current reasoning before deciding the next action.",
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
