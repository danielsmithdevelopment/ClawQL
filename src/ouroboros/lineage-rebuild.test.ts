import { describe, expect, it } from "vitest";
import type { StoredEvent } from "clawql-ouroboros";
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
});
