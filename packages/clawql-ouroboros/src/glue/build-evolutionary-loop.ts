import { EvolutionaryLoop } from "../evolutionary-loop.js";
import { getOrCreateOuroborosEventStore } from "./create-event-store.js";
import { getOrCreateOuroborosEngines } from "../effect/ouroboros-engines-service.js";
import { createModelEscalationRouter, loadModelEscalationConfig } from "clawql-inference";

/** Build loop + shared event store (search/execute deps must be configured). */
export function buildEvolutionaryLoop(): {
  loop: EvolutionaryLoop;
  eventStore: ReturnType<typeof getOrCreateOuroborosEventStore>;
} {
  const eventStore = getOrCreateOuroborosEventStore();
  const engines = getOrCreateOuroborosEngines();
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
