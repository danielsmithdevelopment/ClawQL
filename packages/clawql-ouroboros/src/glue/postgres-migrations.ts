/**
 * DDL for Ouroboros append-only event log (GitHub #142).
 */

import type { PoolClient } from "pg";
import { Effect } from "effect";

async function runOuroborosPostgresMigrationsImpl(client: PoolClient): Promise<void>  {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clawql_ouroboros_events (
      id bigserial PRIMARY KEY,
      root_seed_id text NOT NULL,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS clawql_ouroboros_events_root_id_idx
    ON clawql_ouroboros_events (root_seed_id, id)
  `);
}

export function runOuroborosPostgresMigrationsEffect(client: PoolClient): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => runOuroborosPostgresMigrationsImpl(client),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runOuroborosPostgresMigrationsEffect} for Effect callers. */
export async function runOuroborosPostgresMigrations(client: PoolClient): Promise<void>  {
  return Effect.runPromise(runOuroborosPostgresMigrationsEffect(client));
}
