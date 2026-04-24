/**
 * Rebuild {@link OntologyLineage} from stored events (shared by in-memory semantics and Postgres).
 */

import type { GenerationRecord, OntologyLineage, Seed, StoredEvent } from "clawql-ouroboros";

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

export function buildOntologyLineageFromEvents(
  seedId: string,
  events: StoredEvent[]
): OntologyLineage {
  const relevant = events.filter((e) => e.seed_id === seedId);

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
