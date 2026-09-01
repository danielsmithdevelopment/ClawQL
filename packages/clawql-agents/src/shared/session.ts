import { Effect } from "effect";
import type { AgentName, AgentSession } from "./types.js";

/** Create a new agent session record (sync Effect). */
export const createAgentSession = (agent: AgentName): Effect.Effect<AgentSession> =>
  Effect.sync(() => ({
    sessionId: crypto.randomUUID(),
    agent,
    startedAt: new Date().toISOString(),
  }));
