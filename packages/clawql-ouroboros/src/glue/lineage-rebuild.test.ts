import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../interfaces.js";
import { buildOntologyLineageFromEvents } from "./lineage-rebuild.js";

describe("buildOntologyLineageFromEvents", () => {
  it("builds lineage from generation_completed and ouroboros_finished", () => {
    const seedId = "seed_root";
    const events: StoredEvent[] = [
      {
        type: "generation_completed",
        seed_id: seedId,
        data: {
          generation_number: 1,
          seed: { goal: "g" } as never,
          execution_output: "out",
          evaluation_summary: {
            final_approved: true,
            score: 0.9,
            ac_results: [{ ac_index: 0, ac_content: "c", passed: true, evidence: "" }],
          },
          phase: "completed",
          ontology_schema: { name: "o", description: "d", fields: [] },
        },
      },
      {
        type: "ouroboros_finished",
        seed_id: seedId,
        data: { converged: true, generation_count: 1 },
      },
    ];
    const lin = buildOntologyLineageFromEvents(seedId, events);
    expect(lin.seed_id).toBe(seedId);
    expect(lin.generations).toHaveLength(1);
    expect(lin.status).toBe("converged");
    expect(lin.current_generation).toBe(1);
  });

  it("surfaces latest_drift from drift_measured events", () => {
    const seedId = "seed_drift";
    const events: StoredEvent[] = [
      {
        type: "drift_measured",
        seed_id: seedId,
        data: {
          generation_number: 1,
          combined_drift: 0.22,
          band: "acceptable",
          goal_drift: 0.1,
          constraint_drift: 0.2,
          ontology_drift: 0.4,
        },
      },
      {
        type: "drift_measured",
        seed_id: seedId,
        data: {
          generation_number: 2,
          combined_drift: 0.11,
          band: "excellent",
          goal_drift: 0.05,
          constraint_drift: 0.1,
          ontology_drift: 0.2,
        },
      },
    ];
    const lin = buildOntologyLineageFromEvents(seedId, events);
    expect(lin.latest_drift?.combined_drift).toBe(0.11);
    expect(lin.latest_drift?.band).toBe("excellent");
    expect(lin.latest_drift?.generation_number).toBe(2);
  });
});
