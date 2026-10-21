/**
 * Persistent undici Agent per OpenAPPA base URL — keep-alive instead of
 * opening a new connection on every tool call.
 */

import { Agent } from "undici";
import { Effect } from "effect";

const agents = new Map<string, Agent>();

export function openAppaHttpAgentEffect(baseUrl: string): Effect.Effect<Agent> {
  return Effect.sync(() => {
    const key = baseUrl.replace(/\/$/, "");
    let agent = agents.get(key);
    if (!agent) {
      agent = new Agent({
        keepAliveTimeout: 30_000,
        keepAliveMaxTimeout: 60_000,
        connections: 8,
        pipelining: 1,
      });
      agents.set(key, agent);
    }
    return agent;
  });
}

/** Test / shutdown helper — closes keep-alive pools. */
export function closeOpenAppaHttpAgentsEffect(): Effect.Effect<void> {
  return Effect.promise(async () => {
    const pending = [...agents.values()].map((a) => a.close());
    agents.clear();
    await Promise.all(pending);
  });
}

export function resetOpenAppaHttpAgentsForTests(): void {
  for (const a of agents.values()) {
    void a.close();
  }
  agents.clear();
}
