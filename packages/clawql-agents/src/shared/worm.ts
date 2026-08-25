import {
  WORMAuditTrail,
  createFailingRemoteBackend,
  makeWORMAuditTrailLayer,
  openSqliteBackend,
  type WORMAppendInput,
  type WORMEntryType,
} from "clawql-audit";
import { Effect, Layer } from "effect";
import type { AgentName, AgentSession } from "./types.js";

/** Shared local-only WORM layer (sql.js + failing remote stub). */
export const makeAgentWormLayer = (wormDbPath: string) =>
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

export const sessionLifecycleAppend = (
  type: Extract<WORMEntryType, "SESSION_START" | "SESSION_END"> | WORMEntryType,
  session: AgentSession,
  agentName: AgentName,
  metadata?: Record<string, unknown>
): WORMAppendInput => ({
  type,
  timestamp: type.includes("END") ? new Date().toISOString() : session.startedAt,
  sessionId: session.sessionId,
  agentName,
  metadata,
});

/** Append helper for adapters that already hold WORMAuditTrail. */
export const appendSessionStart = (
  session: AgentSession,
  type: WORMEntryType,
  metadata?: Record<string, unknown>
) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    return yield* worm.append(sessionLifecycleAppend(type, session, session.agent, metadata));
  });

export const appendSessionEnd = (session: AgentSession, type: WORMEntryType) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    return yield* worm.append({
      type,
      timestamp: new Date().toISOString(),
      sessionId: session.sessionId,
      agentName: session.agent,
    });
  });
