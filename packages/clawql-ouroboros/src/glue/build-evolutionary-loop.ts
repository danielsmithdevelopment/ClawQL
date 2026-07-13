import { EvolutionaryLoop } from "../evolutionary-loop.js";
import { createDefaultOuroborosEngines } from "./default-engines.js";
import { getOrCreateOuroborosEventStore } from "./create-event-store.js";
import { getOuroborosPluginDeps } from "../plugin/deps.js";
import { createModelEscalationRouter, loadModelEscalationConfig } from "clawql-inference";

/** Build loop + shared event store (search/execute deps must be configured). */
export function buildEvolutionaryLoop(): {
  loop: EvolutionaryLoop;
  eventStore: ReturnType<typeof getOrCreateOuroborosEventStore>;
} {
  const { search, execute } = getOuroborosPluginDeps();
  const eventStore = getOrCreateOuroborosEventStore();
  const engines = createDefaultOuroborosEngines({
    search: async (query, limit) => {
      const r = await search({ query, limit });
      return { content: [...r.content] };
    },
    execute: async (params) => {
      const r = await execute(params);
      return { content: [...r.content] };
    },
  });
  const router = createModelEscalationRouter(loadModelEscalationConfig());
  const loop = new EvolutionaryLoop(
    eventStore,
    engines.wonder,
    engines.reflect,
    engines.execute,
    engines.evaluate,
    {},
    { router }
  );
  return { loop, eventStore };
}
