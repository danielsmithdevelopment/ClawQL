import { WORMAuditTrail } from "clawql-audit";
import { Effect, Layer, Ref } from "effect";
import { createAgentSession } from "../../shared/session.js";
import type { AgentHealth, AgentSession, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import { makeAgentWormLayer } from "../../shared/worm.js";
import type { DeepSeekHookEvent } from "./worm-hooks.js";
import { deepSeekHookToWormAppend } from "./worm-hooks.js";

export type DeepSeekAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
};

export const makeDeepSeekWormLayer = makeAgentWormLayer;

export const makeDeepSeekAdapterLayer = () =>
  Layer.effect(
    AgentAdapter,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<DeepSeekAdapterState>({ config: null, session: null });

      return AgentAdapter.of({
        name: "deepseek",
        version: "0.1.0",
        initialize: (config) =>
          Ref.update(stateRef, () => ({ config, session: null })).pipe(Effect.asVoid),

        start: (atrScope) =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return yield* Effect.die(new Error("DeepSeek adapter not initialized"));
            }
            const session = yield* createAgentSession("deepseek");
            yield* Ref.update(stateRef, (s) => ({ ...s, session }));
            const worm = yield* WORMAuditTrail;
            yield* worm.append({
              type: "SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "deepseek",
              virtualKeyId: state.config.virtualKeyId,
              metadata: {
                atrToolsInScope: [...atrScope.toolsInScope],
                atrToolsOutOfScope: [...atrScope.toolsOutOfScope],
                cordis: true,
              },
            });
            return session;
          }),

        stop: (session) =>
          Effect.gen(function* () {
            const worm = yield* WORMAuditTrail;
            yield* worm.append({
              type: "SESSION_END",
              timestamp: new Date().toISOString(),
              sessionId: session.sessionId,
              agentName: "deepseek",
            });
            yield* Ref.update(stateRef, (s) => ({ ...s, session: null }));
          }),

        health: () =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return { status: "down", details: "not initialized" } satisfies AgentHealth;
            }
            const worm = yield* WORMAuditTrail;
            const verified = yield* worm.verify();
            return {
              status: verified.ok ? "healthy" : "degraded",
              details: verified.ok ? "worm chain ok" : `verify issues: ${verified.issues.length}`,
            } satisfies AgentHealth;
          }),
      });
    })
  );

export const appendDeepSeekHook = (event: DeepSeekHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    return yield* worm.append(deepSeekHookToWormAppend(event));
  });

export {
  DeepSeekPluginDenyError,
  gateDeepSeekPluginLoad,
  deepSeekHookToWormAppend,
} from "./worm-hooks.js";
export type { DeepSeekHookEvent, DeepSeekHookKind } from "./worm-hooks.js";
