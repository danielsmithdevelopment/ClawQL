import {
  WORMAuditTrail,
  createFailingRemoteBackend,
  makeWORMAuditTrailLayer,
  openSqliteBackend,
} from "clawql-audit";
import { Context, Effect, Layer, Ref } from "effect";
import type { AgentHealth, AgentSession, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import type { ClineHookEvent } from "./worm-hooks.js";
import { clineHookToWormAppend } from "./worm-hooks.js";

export type ClineAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
};

export const ClineAdapterState = Context.GenericTag<ClineAdapterState>("clawql/ClineAdapterState");

export const makeClineWormLayer = (wormDbPath: string) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const handle = yield* openSqliteBackend(wormDbPath);
      return makeWORMAuditTrailLayer({
        local: handle.backend,
        remote: createFailingRemoteBackend("remote not configured"),
        retry: { maxAttempts: 3, backoffMs: 50, backoffMultiplier: 2 },
      });
    })
  );

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
            const session: AgentSession = {
              sessionId: crypto.randomUUID(),
              agent: "cline",
              startedAt: new Date().toISOString(),
            };
            yield* Ref.update(stateRef, (s) => ({ ...s, session }));
            const worm = yield* WORMAuditTrail;
            yield* worm.append({
              type: "CLINE_SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "cline",
              metadata: {
                atrToolsInScope: [...atrScope.toolsInScope],
                atrToolsOutOfScope: [...atrScope.toolsOutOfScope],
              },
            });
            return session;
          }),

        stop: (session) =>
          Effect.gen(function* () {
            const worm = yield* WORMAuditTrail;
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

/** Append a Cline SDK hook event to the durable WORM trail. */
export const appendClineHook = (event: ClineHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    return yield* worm.append(clineHookToWormAppend(event));
  });
