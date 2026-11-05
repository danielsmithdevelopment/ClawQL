/**
 * Agent Substrate control-plane client — mock + live HTTP façade (ADR 0011).
 * Live mode posts to CLAWQL_SANDBOX_AGENT_SUBSTRATE_URL; mock keeps sessions in-process.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { Data } from "effect";
import type { SandboxCodeToolInput } from "../types.js";
import { recordAgentSubstrateLifecycle } from "./worm-bridge.js";
import type { AgentSubstrateWormSink } from "./worm-bridge.js";
import {
  transitionAgentSubstrateSession,
  type AgentSubstrateSessionIllegalTransition,
} from "./agent-substrate-session-transition.js";
import {
  readAgentSubstrateConfig,
  type AgentSubstrateConfig,
  type AgentSubstrateExecResult,
  type AgentSubstrateSession,
  type AgentSubstrateRuntime,
} from "./types.js";
import { defaultPersistence, parseTimeoutMs, resolveSandboxId } from "../shared.js";

export class AgentSubstrateError extends Data.TaggedError("AgentSubstrateError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class AgentSubstrateService extends Context.Service<
  AgentSubstrateService,
  {
    readonly config: () => AgentSubstrateConfig;
    readonly ensureSession: (
      sessionId: string
    ) => Effect.Effect<AgentSubstrateSession, AgentSubstrateError, AgentSubstrateWormSink>;
    readonly suspend: (
      sessionId: string
    ) => Effect.Effect<AgentSubstrateSession, AgentSubstrateError, AgentSubstrateWormSink>;
    readonly resume: (
      sessionId: string
    ) => Effect.Effect<AgentSubstrateSession, AgentSubstrateError, AgentSubstrateWormSink>;
    readonly terminate: (
      sessionId: string
    ) => Effect.Effect<AgentSubstrateSession, AgentSubstrateError, AgentSubstrateWormSink>;
    readonly exec: (
      input: SandboxCodeToolInput
    ) => Effect.Effect<AgentSubstrateExecResult, AgentSubstrateError, AgentSubstrateWormSink>;
  }
>()("clawql/AgentSubstrateService") {}

type SessionStore = Map<string, AgentSubstrateSession>;

function nowIso(): string {
  return new Date().toISOString();
}

function mapSessionIllegal(err: AgentSubstrateSessionIllegalTransition): AgentSubstrateError {
  return new AgentSubstrateError({
    reason: `illegal agent-substrate session transition: ${err.from}+${err.event}`,
    cause: err,
  });
}

function makeSession(sessionId: string, runtime: AgentSubstrateRuntime): AgentSubstrateSession {
  const t = nowIso();
  return {
    sessionId,
    runtime,
    state: "running",
    createdAt: t,
    lastTransitionAt: t,
  };
}

/**
 * Mock client: simulates create/suspend/resume/exec with WORM side effects.
 * Used for tests and non-cluster dev (`CLAWQL_SANDBOX_AGENT_SUBSTRATE_MODE=mock`).
 */
export function createMockAgentSubstrateLayer(
  config: AgentSubstrateConfig = readAgentSubstrateConfig()
): Layer.Layer<AgentSubstrateService> {
  return Layer.effect(
    AgentSubstrateService,
    Effect.gen(function* () {
      const sessions = yield* Ref.make<SessionStore>(new Map());

      const putSession = (session: AgentSubstrateSession) =>
        Ref.update(sessions, (m) => {
          const next = new Map(m);
          next.set(session.sessionId, session);
          return next;
        });

      const ensureSession = (sessionId: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          const existing = map.get(sessionId);
          if (!existing) {
            yield* transitionAgentSubstrateSession("none", { _tag: "Create" }).pipe(
              Effect.mapError(mapSessionIllegal)
            );
            const session = makeSession(sessionId, config.runtime);
            yield* putSession(session);
            yield* recordAgentSubstrateLifecycle({ kind: "session_created", session });
            return session;
          }
          if (existing.state === "suspended") {
            return yield* resume(sessionId);
          }
          if (existing.state === "running") {
            yield* transitionAgentSubstrateSession("running", { _tag: "Resume" }).pipe(
              Effect.mapError(mapSessionIllegal)
            );
            return existing;
          }
          // terminated — no rebirth (CreateAtMostOnce)
          yield* transitionAgentSubstrateSession("terminated", { _tag: "Create" }).pipe(
            Effect.mapError(mapSessionIllegal)
          );
          return existing;
        });

      const suspend = (sessionId: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          const cur = map.get(sessionId);
          if (!cur) {
            return yield* Effect.fail(
              new AgentSubstrateError({ reason: `unknown session: ${sessionId}` })
            );
          }
          const next = yield* transitionAgentSubstrateSession(cur.state, { _tag: "Suspend" }).pipe(
            Effect.mapError(mapSessionIllegal)
          );
          if (next.alreadyDone) return cur;
          const session: AgentSubstrateSession = {
            ...cur,
            state: next.status,
            lastTransitionAt: nowIso(),
          };
          yield* putSession(session);
          yield* recordAgentSubstrateLifecycle({ kind: "session_suspended", session });
          return session;
        });

      const resume = (sessionId: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          const cur = map.get(sessionId);
          if (!cur) {
            return yield* Effect.fail(
              new AgentSubstrateError({ reason: `unknown session: ${sessionId}` })
            );
          }
          const next = yield* transitionAgentSubstrateSession(cur.state, { _tag: "Resume" }).pipe(
            Effect.mapError(mapSessionIllegal)
          );
          if (next.alreadyDone) return cur;
          const session: AgentSubstrateSession = {
            ...cur,
            state: next.status,
            lastTransitionAt: nowIso(),
          };
          yield* putSession(session);
          yield* recordAgentSubstrateLifecycle({ kind: "session_resumed", session });
          return session;
        });

      const terminate = (sessionId: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          const cur = map.get(sessionId);
          if (!cur) {
            return yield* Effect.fail(
              new AgentSubstrateError({ reason: `unknown session: ${sessionId}` })
            );
          }
          const next = yield* transitionAgentSubstrateSession(cur.state, {
            _tag: "Terminate",
          }).pipe(Effect.mapError(mapSessionIllegal));
          if (next.alreadyDone) return cur;
          const session: AgentSubstrateSession = {
            ...cur,
            state: next.status,
            lastTransitionAt: nowIso(),
          };
          yield* putSession(session);
          yield* recordAgentSubstrateLifecycle({ kind: "session_terminated", session });
          return session;
        });

      return {
        config: () => config,
        ensureSession,
        suspend,
        resume,
        terminate,
        exec: (input) =>
          Effect.gen(function* () {
            if (
              process.env.NODE_ENV === "production" &&
              !config.allowProduction &&
              config.mode === "live"
            ) {
              return yield* Effect.fail(
                new AgentSubstrateError({
                  reason:
                    "Agent Substrate production path blocked until CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION=1 (ADR 0011 §5)",
                })
              );
            }
            const persistenceMode = input.persistenceMode ?? defaultPersistence();
            const sessionId = resolveSandboxId(persistenceMode, input.sessionId);
            const before = yield* Ref.get(sessions).pipe(Effect.map((m) => m.get(sessionId)));
            const resumedFromSuspend = before?.state === "suspended";
            yield* ensureSession(sessionId);
            // Mock execution: echo a deterministic marker (no real guest).
            void parseTimeoutMs(input.timeoutMs);
            const result: AgentSubstrateExecResult = {
              stdout: `[agent-substrate:${config.runtime}:mock] ok language=${input.language} bytes=${Buffer.byteLength(input.code, "utf8")}\n`,
              stderr: "",
              exitCode: 0,
              success: true,
              sessionId,
              runtime: config.runtime,
              resumedFromSuspend: Boolean(resumedFromSuspend),
            };
            yield* recordAgentSubstrateLifecycle({
              kind: "exec_completed",
              sessionId,
              input: { language: input.language, sessionId: input.sessionId },
              result,
            });
            return result;
          }),
      };
    })
  );
}

/**
 * Live HTTP client — posts JSON to Agent Substrate control plane.
 * Shape is ClawQL's stable façade; map to upstream CRDs as the control plane stabilizes.
 */
export function createLiveAgentSubstrateLayer(
  config: AgentSubstrateConfig
): Layer.Layer<AgentSubstrateService> {
  if (!config.controlPlaneUrl || !config.apiToken) {
    return createMockAgentSubstrateLayer({ ...config, mode: "mock" });
  }

  const base = config.controlPlaneUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  return Layer.succeed(AgentSubstrateService, {
    config: () => config,
    ensureSession: (sessionId) =>
      Effect.gen(function* () {
        const expected = yield* transitionAgentSubstrateSession("none", { _tag: "Create" }).pipe(
          Effect.mapError(mapSessionIllegal)
        );
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(`${base}/v1/sessions`, {
              method: "POST",
              headers,
              body: JSON.stringify({ sessionId, runtime: config.runtime }),
            }),
          catch: (cause) =>
            new AgentSubstrateError({ reason: "ensureSession fetch failed", cause }),
        });
        if (!res.ok) {
          return yield* Effect.fail(
            new AgentSubstrateError({ reason: `ensureSession HTTP ${res.status}` })
          );
        }
        const body = (yield* Effect.tryPromise({
          try: () => res.json() as Promise<AgentSubstrateSession>,
          catch: (cause) => new AgentSubstrateError({ reason: "ensureSession JSON failed", cause }),
        })) as AgentSubstrateSession;
        if (body.state !== expected.status) {
          return yield* Effect.fail(
            new AgentSubstrateError({
              reason: `ensureSession returned state ${body.state}, expected ${expected.status}`,
            })
          );
        }
        yield* recordAgentSubstrateLifecycle({ kind: "session_created", session: body });
        return body;
      }),
    suspend: (sessionId) =>
      Effect.gen(function* () {
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(`${base}/v1/sessions/${encodeURIComponent(sessionId)}/suspend`, {
              method: "POST",
              headers,
            }),
          catch: (cause) => new AgentSubstrateError({ reason: "suspend fetch failed", cause }),
        });
        if (!res.ok) {
          return yield* Effect.fail(
            new AgentSubstrateError({ reason: `suspend HTTP ${res.status}` })
          );
        }
        const body = (yield* Effect.tryPromise({
          try: () => res.json() as Promise<AgentSubstrateSession>,
          catch: (cause) => new AgentSubstrateError({ reason: "suspend JSON failed", cause }),
        })) as AgentSubstrateSession;
        if (body.state !== "suspended") {
          return yield* Effect.fail(
            new AgentSubstrateError({
              reason: `suspend returned state ${body.state}, expected suspended`,
            })
          );
        }
        yield* recordAgentSubstrateLifecycle({ kind: "session_suspended", session: body });
        return body;
      }),
    resume: (sessionId) =>
      Effect.gen(function* () {
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(`${base}/v1/sessions/${encodeURIComponent(sessionId)}/resume`, {
              method: "POST",
              headers,
            }),
          catch: (cause) => new AgentSubstrateError({ reason: "resume fetch failed", cause }),
        });
        if (!res.ok) {
          return yield* Effect.fail(
            new AgentSubstrateError({ reason: `resume HTTP ${res.status}` })
          );
        }
        const body = (yield* Effect.tryPromise({
          try: () => res.json() as Promise<AgentSubstrateSession>,
          catch: (cause) => new AgentSubstrateError({ reason: "resume JSON failed", cause }),
        })) as AgentSubstrateSession;
        if (body.state !== "running") {
          return yield* Effect.fail(
            new AgentSubstrateError({
              reason: `resume returned state ${body.state}, expected running`,
            })
          );
        }
        yield* recordAgentSubstrateLifecycle({ kind: "session_resumed", session: body });
        return body;
      }),
    terminate: (sessionId) =>
      Effect.gen(function* () {
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(`${base}/v1/sessions/${encodeURIComponent(sessionId)}/terminate`, {
              method: "POST",
              headers,
            }),
          catch: (cause) => new AgentSubstrateError({ reason: "terminate fetch failed", cause }),
        });
        if (!res.ok) {
          return yield* Effect.fail(
            new AgentSubstrateError({ reason: `terminate HTTP ${res.status}` })
          );
        }
        const body = (yield* Effect.tryPromise({
          try: () => res.json() as Promise<AgentSubstrateSession>,
          catch: (cause) => new AgentSubstrateError({ reason: "terminate JSON failed", cause }),
        })) as AgentSubstrateSession;
        if (body.state !== "terminated") {
          return yield* Effect.fail(
            new AgentSubstrateError({
              reason: `terminate returned state ${body.state}, expected terminated`,
            })
          );
        }
        yield* recordAgentSubstrateLifecycle({ kind: "session_terminated", session: body });
        return body;
      }),
    exec: (input) =>
      Effect.gen(function* () {
        if (!config.allowProduction && process.env.NODE_ENV === "production") {
          return yield* Effect.fail(
            new AgentSubstrateError({
              reason:
                "Agent Substrate production path blocked until CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION=1 (ADR 0011 §5)",
            })
          );
        }
        const persistenceMode = input.persistenceMode ?? defaultPersistence();
        const sessionId = resolveSandboxId(persistenceMode, input.sessionId);
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(`${base}/v1/sessions/${encodeURIComponent(sessionId)}/exec`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                code: input.code,
                language: input.language,
                timeoutMs: input.timeoutMs,
                runtime: config.runtime,
              }),
            }),
          catch: (cause) => new AgentSubstrateError({ reason: "exec fetch failed", cause }),
        });
        if (!res.ok) {
          return yield* Effect.fail(new AgentSubstrateError({ reason: `exec HTTP ${res.status}` }));
        }
        const result = (yield* Effect.tryPromise({
          try: () => res.json() as Promise<AgentSubstrateExecResult>,
          catch: (cause) => new AgentSubstrateError({ reason: "exec JSON failed", cause }),
        })) as AgentSubstrateExecResult;
        yield* recordAgentSubstrateLifecycle({
          kind: "exec_completed",
          sessionId,
          input: { language: input.language, sessionId: input.sessionId },
          result,
        });
        return result;
      }),
  });
}

export function agentSubstrateLiveFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<AgentSubstrateService> {
  const cfg = readAgentSubstrateConfig(env);
  return cfg.mode === "live"
    ? createLiveAgentSubstrateLayer(cfg)
    : createMockAgentSubstrateLayer(cfg);
}
