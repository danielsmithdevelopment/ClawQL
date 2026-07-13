import { InMemoryEventStore } from "../in-memory-event-store.js";
import type { EventStore } from "../interfaces.js";
import { PostgresOuroborosEventStore } from "./postgres-event-store.js";
import { getOuroborosPgPool } from "./postgres-pool.js";

let sharedEventStore: EventStore | null = null;

/** Shared event store instance (Postgres when configured, else in-memory). */
export function getOrCreateOuroborosEventStore(): EventStore {
  if (!sharedEventStore) {
    const pgPool = getOuroborosPgPool();
    sharedEventStore = pgPool ? new PostgresOuroborosEventStore(pgPool) : new InMemoryEventStore();
  }
  return sharedEventStore;
}

/** Vitest: reset singleton so env / pool changes apply. */
export function resetOuroborosEventStoreForTests(): void {
  sharedEventStore = null;
}
