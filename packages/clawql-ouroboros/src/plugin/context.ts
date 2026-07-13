import {
  getOrCreateOuroborosEventStore,
  resetOuroborosEventStoreForTests,
} from "../glue/create-event-store.js";
import { buildEvolutionaryLoop } from "../glue/build-evolutionary-loop.js";
import { closeOuroborosPgPool, registerOuroborosPoolShutdownHooks } from "../glue/postgres-pool.js";
import type { OuroborosContext } from "../mcp-hooks.js";
import { resetOuroborosLoopDepsForTests } from "../effect/ouroboros-loop-service.js";

let ctxCache: OuroborosContext | null = null;
let shutdownHooksRegistered = false;

export function getOuroborosContext(): OuroborosContext {
  if (!ctxCache) {
    const { loop, eventStore } = buildEvolutionaryLoop();
    ctxCache = { ouroborosLoop: loop, eventStore };
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
  resetOuroborosLoopDepsForTests();
  void closeOuroborosPgPool();
}
