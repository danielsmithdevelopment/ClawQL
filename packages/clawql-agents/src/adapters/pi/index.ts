import { WORMAuditTrail } from "clawql-audit";
import { Effect, Layer, Ref } from "effect";
import { createAgentSession } from "../../shared/session.js";
import type { AgentHealth, AgentSession, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import { makeAgentWormLayer } from "../../shared/worm.js";
import type { PiHookEvent } from "./worm-hooks.js";
import { piHookToWormAppend } from "./worm-hooks.js";

export type PiAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
};

export const makePiWormLayer = makeAgentWormLayer;

export const makePiAdapterLayer = () =>
  Layer.effect(
    AgentAdapter,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<PiAdapterState>({ config: null, session: null });

      return AgentAdapter.of({
        name: "pi",
        version: "0.1.0",
        initialize: (config) =>
          Ref.update(stateRef, () => ({ config, session: null })).pipe(Effect.asVoid),

        start: (atrScope) =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return yield* Effect.die(new Error("Pi adapter not initialized"));
            }
            const session = yield* createAgentSession("pi");
            yield* Ref.update(stateRef, (s) => ({ ...s, session }));
            const worm = yield* WORMAuditTrail;
            yield* worm.append({
              type: "SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "pi",
              virtualKeyId: state.config.virtualKeyId,
              metadata: {
                atrToolsInScope: [...atrScope.toolsInScope],
                atrToolsOutOfScope: [...atrScope.toolsOutOfScope],
                memoryRecallOnStart: atrScope.toolsInScope.includes("memory_recall"),
              },
            });
            if (atrScope.toolsInScope.includes("memory_recall")) {
              yield* worm.append(
                piHookToWormAppend({
                  kind: "memory_recall",
                  sessionId: session.sessionId,
                  operation: "session_bootstrap",
                })
              );
            }
            return session;
          }),

        stop: (session) =>
          Effect.gen(function* () {
            const worm = yield* WORMAuditTrail;
            yield* worm.append({
              type: "SESSION_END",
              timestamp: new Date().toISOString(),
              sessionId: session.sessionId,
              agentName: "pi",
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

export const appendPiHook = (event: PiHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    return yield* worm.append(piHookToWormAppend(event));
  });
