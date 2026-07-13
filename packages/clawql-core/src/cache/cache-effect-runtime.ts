import { Cause, Effect, Exit } from "effect";
import { CacheLive, CacheService, cacheOperationProgram } from "./cache-service.js";
import type { CacheOperationInput, CacheOperationResult } from "./types.js";

/** Run a cache Effect program with the default LRU Layer. */
export async function runCacheEffect<A, E>(program: Effect.Effect<A, E, CacheService>): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(CacheLive)));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/** Execute one cache tool operation via Effect services (MCP bridge). */
export function runCacheOperation(input: CacheOperationInput): Promise<CacheOperationResult> {
  return runCacheEffect(cacheOperationProgram(input));
}
