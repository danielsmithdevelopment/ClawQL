import { EvolutionaryLoop, InMemoryEventStore, type EventStore } from "../index.js";
import { createDefaultOuroborosEngines } from "../glue/default-engines.js";
import { PostgresOuroborosEventStore } from "../glue/postgres-event-store.js";
import {
  closeOuroborosPgPool,
  getOuroborosPgPool,
  registerOuroborosPoolShutdownHooks,
} from "../glue/postgres-pool.js";
import type { OuroborosContext } from "../mcp-hooks.js";
import { getOuroborosPluginDeps } from "./deps.js";

let ctxCache: OuroborosContext | null = null;
let shutdownHooksRegistered = false;

function createEventStore(): EventStore {
  const pgPool = getOuroborosPgPool();
  if (pgPool) {
    return new PostgresOuroborosEventStore(pgPool);
  }
  return new InMemoryEventStore();
}

export function getOuroborosContext(): OuroborosContext {
  if (!ctxCache) {
    const { search, execute } = getOuroborosPluginDeps();
    const eventStore = createEventStore();
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
    const ouroborosLoop = new EvolutionaryLoop(
      eventStore,
      engines.wonder,
      engines.reflect,
      engines.execute,
      engines.evaluate,
      {}
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
  void closeOuroborosPgPool();
}
