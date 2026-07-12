/**
 * Rebuild {@link OntologyLineage} from stored events (shared by in-memory semantics and Postgres).
 */

import type { GenerationRecord, OntologyLineage, DriftSummary, ConvergenceSummary } from "../lineage.js";
import type { Seed } from "../seed.js";
import type { StoredEvent } from "../interfaces.js";

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
  reason_code?: string;
  reason?: string;
  ontology_similarity?: number;
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

function parseConvergenceSummary(data: unknown): ConvergenceSummary | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as Record<string, unknown>;
  if (typeof d.converged !== "boolean" || typeof d.generation_count !== "number") return undefined;
  return {
    converged: d.converged,
    generation_count: d.generation_count,
    reason_code: typeof d.reason_code === "string" ? d.reason_code : undefined,
    reason: typeof d.reason === "string" ? d.reason : undefined,
    ontology_similarity:
      typeof d.ontology_similarity === "number" ? d.ontology_similarity : undefined,
  };
}

function parseDriftSummary(data: unknown): DriftSummary | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as Record<string, unknown>;
  if (typeof d.combined_drift !== "number" || typeof d.band !== "string") return undefined;
  return {
    combined_drift: d.combined_drift,
    band: d.band,
    goal_drift: typeof d.goal_drift === "number" ? d.goal_drift : 0,
    constraint_drift: typeof d.constraint_drift === "number" ? d.constraint_drift : 0,
    ontology_drift: typeof d.ontology_drift === "number" ? d.ontology_drift : 0,
    generation_number:
      typeof d.generation_number === "number" ? d.generation_number : undefined,
  };
}

export function latestDriftFromEvents(events: StoredEvent[]): DriftSummary | undefined {
  const driftEvents = events.filter((e) => e.type === "drift_measured");
  if (driftEvents.length === 0) return undefined;
  const latest = driftEvents[driftEvents.length - 1];
  return parseDriftSummary(latest.data);
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
    latest_drift: latestDriftFromEvents(relevant),
    latest_convergence:
      finished?.data !== undefined ? parseConvergenceSummary(finished.data) : undefined,
  };
}
