import { WORMAuditTrailService } from "clawql-audit";
import { Effect, Layer, Ref } from "effect";
import { createAgentSession } from "../../shared/session.js";
import type { AgentHealth, AgentSession, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import { makeAgentWormLayer } from "../../shared/worm.js";
import type { ClineHookEvent } from "./worm-hooks.js";
import { clineHookToWormAppend } from "./worm-hooks.js";

export type ClineAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
};

/** @deprecated Prefer makeAgentWormLayer from shared/worm.js */
export const makeClineWormLayer = makeAgentWormLayer;

export const makeClineAdapterLayer = () =>
  Layer.effect(
    AgentAdapter,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<ClineAdapterState>({ config: null, session: null });

      return AgentAdapter.of({
        name: "cline",
        version: "0.1.0",
        initialize: (config) =>
          Ref.update(stateRef, () => ({ config, session: null })).pipe(Effect.asVoid),

        start: (atrScope) =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return yield* Effect.die(new Error("Cline adapter not initialized"));
            }
            const session = yield* createAgentSession("cline");
            yield* Ref.update(stateRef, (s) => ({ ...s, session }));
            const worm = yield* WORMAuditTrailService;
            yield* worm.append({
              type: "CLINE_SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "cline",
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
              type: "CLINE_SESSION_END",
              timestamp: new Date().toISOString(),
              sessionId: session.sessionId,
              agentName: "cline",
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
              details: verified.valid ? "worm chain ok" : (verified.reason ?? `invalidAt=${verified.invalidAt}`),
            } satisfies AgentHealth;
          }),
      });
    })
  );

/** Append a Cline SDK hook event to the durable WORM trail. */
export const appendClineHook = (event: ClineHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append(clineHookToWormAppend(event));
  });
