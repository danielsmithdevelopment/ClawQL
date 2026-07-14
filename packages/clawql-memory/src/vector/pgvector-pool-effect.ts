/**
 * Effect acquire/release for vault pgvector pool (plan §7 resources).
 */

import { Effect, Scope } from "effect";
import type pg from "pg";
import { closePostgresVectorPool, getPostgresVectorPool } from "./pgvector.js";

/** Acquire shared vector pool (or null); release → {@link closePostgresVectorPool}. */
export function postgresVectorPoolScopedEffect(): Effect.Effect<
  pg.Pool | null,
  never,
  Scope.Scope
> {
  return Effect.acquireRelease(
    Effect.sync(() => getPostgresVectorPool()),
    () => Effect.promise(() => closePostgresVectorPool())
  );
}
