import type { EventStore, StoredEvent } from "./interfaces.js";
import type { GenerationRecord, OntologyLineage } from "./lineage.js";
import type { Seed } from "./seed.js";

interface GenerationCompletedPayload {
  generation_number: number;
  seed: Seed;
  execution_output: string;
  evaluation_summary: GenerationRecord["evaluation_summary"];
  phase: GenerationRecord["phase"];
  ontology_schema: Seed["ontology_schema"];
}

interface OuroborosFinishedPayload {
  converged: boolean;
  generation_count: number;
}

function isGenerationPayload(data: unknown): data is GenerationCompletedPayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.generation_number === "number" &&
    typeof d.seed === "object" &&
    d.seed !== null &&
    typeof d.phase === "string"
  );
}

function isFinishedPayload(data: unknown): data is OuroborosFinishedPayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.converged === "boolean" && typeof d.generation_count === "number";
}

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

    const genEvents = relevant
      .filter((e) => e.type === "generation_completed")
      .filter((e) => isGenerationPayload(e.data));

    const generations: GenerationRecord[] = genEvents
      .map((e) => {
        const d = e.data as GenerationCompletedPayload;
        return {
          generation_number: d.generation_number,
          seed: d.seed,
          execution_output: d.execution_output,
          evaluation_summary: d.evaluation_summary,
          phase: d.phase,
          ontology_schema: d.ontology_schema,
        };
      })
      .sort((a, b) => a.generation_number - b.generation_number);

    const finished = [...relevant].reverse().find((e) => e.type === "ouroboros_finished");

    let status: OntologyLineage["status"] = "active";
    if (finished?.data !== undefined && isFinishedPayload(finished.data)) {
      status = finished.data.converged ? "converged" : "exhausted";
    }

    const current_generation =
      generations.length > 0 ? generations[generations.length - 1].generation_number : 0;

    return {
      seed_id: seedId,
      current_generation,
      generations,
      status,
    };
  }

  /** Test helper: raw event log for a lineage root id. */
  snapshot(seedId: string): StoredEvent[] {
    return this.events.filter((e) => e.seed_id === seedId);
  }
}
