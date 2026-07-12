import type { EventStore, StoredEvent } from "./interfaces.js";
import { buildOntologyLineageFromEvents } from "./glue/lineage-rebuild.js";
import type { OntologyLineage } from "./lineage.js";

/**
 * In-memory append log for tests and local development. Not durable across restarts.
 */
export class InMemoryEventStore implements EventStore {
  private readonly events: StoredEvent[] = [];

  async append(event: StoredEvent): Promise<void> {
    this.events.push({
      ...event,
      timestamp: event.timestamp ?? new Date(),
    });
  }

  async getLineage(seedId: string): Promise<OntologyLineage> {
    const relevant = this.events.filter((e) => e.seed_id === seedId);
    return buildOntologyLineageFromEvents(seedId, relevant);
  }

  /** Test helper: raw event log for a lineage root id. */
  snapshot(seedId: string): StoredEvent[] {
    return this.events.filter((e) => e.seed_id === seedId);
  }
}
