import { EvolutionaryLoop } from "../index.js";
import { createDefaultOuroborosEngines } from "../glue/default-engines.js";
import {
  getOrCreateOuroborosEventStore,
  resetOuroborosEventStoreForTests,
} from "../glue/create-event-store.js";
import { closeOuroborosPgPool, registerOuroborosPoolShutdownHooks } from "../glue/postgres-pool.js";
import type { OuroborosContext } from "../mcp-hooks.js";
import { getOuroborosPluginDeps } from "./deps.js";
import { createModelEscalationRouter, loadModelEscalationConfig } from "clawql-inference";

let ctxCache: OuroborosContext | null = null;
let shutdownHooksRegistered = false;

export function getOuroborosContext(): OuroborosContext {
  if (!ctxCache) {
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
    const ouroborosLoop = new EvolutionaryLoop(
      eventStore,
      engines.wonder,
      engines.reflect,
      engines.execute,
      engines.evaluate,
      {},
      { router }
    );
    ctxCache = { ouroborosLoop, eventStore };
  }
  return ctxCache;
}

export function ensureOuroborosPoolShutdownHooks(): void {
  if (!shutdownHooksRegistered) {
    registerOuroborosPoolShutdownHooks();
    shutdownHooksRegistered = true;
  }
}

/** Vitest: clear singleton so env / pool changes apply. */
export function resetOuroborosContextForTests(): void {
  ctxCache = null;
  shutdownHooksRegistered = false;
  resetOuroborosEventStoreForTests();
  void closeOuroborosPgPool();
}
