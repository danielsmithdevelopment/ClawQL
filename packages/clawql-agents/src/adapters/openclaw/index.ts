import { WORMAuditTrailService } from "clawql-audit";
import { Effect, Layer, Ref } from "effect";
import { enforceToolCall } from "../../shared/panguard.js";
import { createAgentSession } from "../../shared/session.js";
import type { AgentHealth, AgentSession, ATRScope, ClawQLAgentConfig } from "../../shared/types.js";
import { AgentAdapter } from "../../shared/types.js";
import { makeAgentWormLayer } from "../../shared/worm.js";
import type { OpenClawHookEvent } from "./worm-hooks.js";
import { openClawHookToWormAppend } from "./worm-hooks.js";

export type OpenClawAdapterState = {
  readonly config: ClawQLAgentConfig | null;
  readonly session: AgentSession | null;
  readonly atrScope: ATRScope | null;
};

export const makeOpenClawWormLayer = makeAgentWormLayer;

export const makeOpenClawAdapterLayer = () =>
  Layer.effect(
    AgentAdapter,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make<OpenClawAdapterState>({
        config: null,
        session: null,
        atrScope: null,
      });

      return AgentAdapter.of({
        name: "openclaw",
        version: "0.1.0",
        initialize: (config) =>
          Ref.update(stateRef, () => ({
            config,
            session: null,
            atrScope: null,
          })).pipe(Effect.asVoid),

        start: (atrScope) =>
          Effect.gen(function* () {
            const state = yield* Ref.get(stateRef);
            if (!state.config) {
              return yield* Effect.die(new Error("OpenClaw adapter not initialized"));
            }
            const session = yield* createAgentSession("openclaw");
            yield* Ref.update(stateRef, (s) => ({ ...s, session, atrScope }));
            const worm = yield* WORMAuditTrailService;
            yield* worm.append({
              type: "SESSION_START",
              timestamp: session.startedAt,
              sessionId: session.sessionId,
              agentName: "openclaw",
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
              agentName: "openclaw",
            });
            yield* Ref.update(stateRef, (s) => ({
              ...s,
              session: null,
              atrScope: null,
            }));
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

export const appendOpenClawHook = (event: OpenClawHookEvent) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append(openClawHookToWormAppend(event));
  });

/**
 * Gateway skill:invoke gate — WORM + Panguard before the skill runs.
 */
export const gateOpenClawSkillInvoke = (input: {
  readonly skillName: string;
  readonly atrScope: ATRScope;
  readonly sessionId: string;
  readonly virtualKeyId?: string;
}) =>
  enforceToolCall({
    toolName: input.skillName.replace(/^clawql_/, ""),
    atrScope: input.atrScope,
    sessionId: input.sessionId,
    agentName: "openclaw",
    virtualKeyId: input.virtualKeyId,
    metadata: { skillName: input.skillName },
  });
