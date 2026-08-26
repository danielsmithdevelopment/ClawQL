import { WORMAuditTrailService } from "clawql-audit";
import { Effect, Layer, Ref } from "effect";
import { createAgentSession } from "../../shared/session.js";
import type { AgentHealth, AgentSession, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import { makeAgentWormLayer } from "../../shared/worm.js";
import type { GooseHookEvent } from "./worm-hooks.js";
import { gooseHookToWormAppend } from "./worm-hooks.js";

export type GooseAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
};

export const makeGooseWormLayer = makeAgentWormLayer;

export const makeGooseAdapterLayer = () =>
  Layer.effect(
    AgentAdapter,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<GooseAdapterState>({ config: null, session: null });

      return AgentAdapter.of({
        name: "goose",
        version: "0.1.0",
        initialize: (config) =>
          Ref.update(stateRef, () => ({ config, session: null })).pipe(Effect.asVoid),

        start: (atrScope) =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return yield* Effect.die(new Error("Goose adapter not initialized"));
            }
            const session = yield* createAgentSession("goose");
            yield* Ref.update(stateRef, (s) => ({ ...s, session }));
            const worm = yield* WORMAuditTrailService;
            yield* worm.append({
              type: "SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "goose",
              virtualKeyId: state.config.virtualKeyId,
              metadata: {
                atrToolsInScope: [...atrScope.toolsInScope],
                atrToolsOutOfScope: [...atrScope.toolsOutOfScope],
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
              agentName: "goose",
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

export const appendGooseHook = (event: GooseHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append(gooseHookToWormAppend(event));
  });

export {
  GoosePathDenyError,
  gateGooseFileWrite,
  gooseHookToWormAppend,
  isPathInScope,
} from "./worm-hooks.js";
export type { GooseHookEvent, GooseHookKind, GoosePathEnforceError } from "./worm-hooks.js";
