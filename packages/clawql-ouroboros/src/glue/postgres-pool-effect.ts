/**
 * Effect acquire/release for Ouroboros Postgres pool (plan §7 resources).
 * Module singleton {@link getOuroborosPgPool} remains for Promise-era call sites;
 * Scope-aware programs should use this helper inside `Effect.scoped`.
 */

import { Effect, type Scope } from "effect";
import type pg from "pg";
import { closeOuroborosPgPool, getOuroborosPgPool } from "./postgres-pool.js";

/** Acquire the shared Ouroboros pool (or null when unset); release → {@link closeOuroborosPgPool}. */
export function ouroborosPgPoolScopedEffect(): Effect.Effect<pg.Pool | null, never, Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => getOuroborosPgPool()),
    () => Effect.promise(() => closeOuroborosPgPool())
  );
}
