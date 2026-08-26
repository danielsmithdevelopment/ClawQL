import {
  MemoryBackend,
  SQLiteBackend,
  WORMAuditTrailService,
  makeWORMAuditTrailLayer,
  type WORMAppendInput,
  type WORMEntryType,
} from "clawql-audit";
import { Effect } from "effect";
import type { AgentName, AgentSession } from "./types.js";

/** Shared local SQLite WORM layer (MemoryBackend remote stub). */
export const makeAgentWormLayer = (wormDbPath: string) =>
  makeWORMAuditTrailLayer({
    local: new SQLiteBackend({ path: wormDbPath }),
    remote: new MemoryBackend(),
    retryMaxAttempts: 3,
    retryBackoffMs: 50,
    retryBackoffMultiplier: 2,
    reconcileIntervalMs: 0,
    merkleBatchSize: 0,
  });

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

/** Append helper for adapters that already hold WORMAuditTrailService. */
export const appendSessionStart = (
  session: AgentSession,
  type: WORMEntryType,
  metadata?: Record<string, unknown>
) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append(sessionLifecycleAppend(type, session, session.agent, metadata));
  });

export const appendSessionEnd = (session: AgentSession, type: WORMEntryType) =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    return yield* worm.append({
      type,
      timestamp: new Date().toISOString(),
      sessionId: session.sessionId,
      agentName: session.agent,
    });
  });
