/**
 * Postgres-backed {@link EventStore} for clawql-ouroboros lineages (#142).
 */

import type { EventStore, StoredEvent } from "clawql-ouroboros";
import type { OntologyLineage } from "clawql-ouroboros";
import type pg from "pg";
import { buildOntologyLineageFromEvents } from "./lineage-rebuild.js";
import { ensureOuroborosSchema } from "./postgres-pool.js";

export class PostgresOuroborosEventStore implements EventStore {
  constructor(private readonly pool: pg.Pool) {}

  async append(event: StoredEvent): Promise<void> {
    await ensureOuroborosSchema();
    const ts = event.timestamp ?? new Date();
    await this.pool.query(
      `INSERT INTO clawql_ouroboros_events (root_seed_id, event_type, payload, created_at)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [event.seed_id, event.type, JSON.stringify(event.data), ts]
    );
  }

  async getLineage(seedId: string): Promise<OntologyLineage> {
    await ensureOuroborosSchema();
    const res = await this.pool.query<{
      event_type: string;
      payload: unknown;
      created_at: Date;
    }>(
      `SELECT event_type, payload, created_at
       FROM clawql_ouroboros_events
       WHERE root_seed_id = $1
       ORDER BY id ASC`,
      [seedId]
    );
    const events: StoredEvent[] = res.rows.map((row) => ({
      type: row.event_type,
      seed_id: seedId,
      data: row.payload,
      timestamp: row.created_at,
    }));
    return buildOntologyLineageFromEvents(seedId, events);
  }
}
