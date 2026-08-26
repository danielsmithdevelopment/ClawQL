import { WORMAuditTrailService } from "clawql-audit";
import { Effect, Layer, Ref } from "effect";
import { createAgentSession } from "../../shared/session.js";
import type { AgentHealth, AgentSession, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import { makeAgentWormLayer } from "../../shared/worm.js";
import type { HermesHookEvent } from "./worm-hooks.js";
import { hermesHookToWormAppend } from "./worm-hooks.js";

export type HermesAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
};

export const makeHermesWormLayer = makeAgentWormLayer;

export const makeHermesAdapterLayer = () =>
  Layer.effect(
    AgentAdapter,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<HermesAdapterState>({ config: null, session: null });

      return AgentAdapter.of({
        name: "hermes",
        version: "0.1.0",
        initialize: (config) =>
          Ref.update(stateRef, () => ({ config, session: null })).pipe(Effect.asVoid),

        start: (atrScope) =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return yield* Effect.die(new Error("Hermes adapter not initialized"));
            }
            const session = yield* createAgentSession("hermes");
            yield* Ref.update(stateRef, (s) => ({ ...s, session }));
            const worm = yield* WORMAuditTrailService;
            yield* worm.append({
              type: "SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "hermes",
              virtualKeyId: state.config.virtualKeyId,
              metadata: {
                atrToolsInScope: [...atrScope.toolsInScope],
                atrToolsOutOfScope: [...atrScope.toolsOutOfScope],
                runtimeHint: "python/hermes/worm_agent.WORMInstrumentedAgent",
              },
            });
            return session;
          }),

        stop: (session) =>
          Effect.gen(function* () {
            const worm = yield* WORMAuditTrailService;
            yield* worm.append({
              type: "SESSION_END",
              timestamp: new Date().toISOString(),
              sessionId: session.sessionId,
              agentName: "hermes",
            });
            yield* Ref.update(stateRef, (s) => ({ ...s, session: null }));
          }),

        health: () =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return { status: "down", details: "not initialized" } satisfies AgentHealth;
            }
            const worm = yield* WORMAuditTrailService;
            const verified = yield* worm.verify();
            return {
              status: verified.valid ? "healthy" : "degraded",
              details: verified.valid
                ? "worm chain ok"
                : (verified.reason ?? `invalidAt=${verified.invalidAt}`),
            } satisfies AgentHealth;
          }),
      });
    })
  );

export const appendHermesHook = (event: HermesHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append(hermesHookToWormAppend(event));
  });
