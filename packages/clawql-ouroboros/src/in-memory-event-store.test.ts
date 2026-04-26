import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "./in-memory-event-store.js";
import type { Seed } from "./seed.js";

function makeSeed(seedId: string): Seed {
  return {
    goal: "store test",
    task_type: "analysis",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: [],
    ontology_schema: { name: "o", description: "d", fields: [] },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: seedId,
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
    },
  };
}

describe("InMemoryEventStore", () => {
  it("reconstructs lineage with sorted generations and converged status", async () => {
    const store = new InMemoryEventStore();
    const seedId = "seed-store-1";
    const seed = makeSeed(seedId);

    await store.append({
      type: "generation_completed",
      seed_id: seedId,
      data: {
        generation_number: 2,
        seed,
        execution_output: "g2",
        evaluation_summary: { final_approved: true, score: 0.9, ac_results: [] },
        phase: "completed",
        ontology_schema: seed.ontology_schema,
      },
    });
    await store.append({
      type: "generation_completed",
      seed_id: seedId,
      data: {
        generation_number: 1,
        seed,
        execution_output: "g1",
        evaluation_summary: { final_approved: true, score: 0.8, ac_results: [] },
        phase: "completed",
        ontology_schema: seed.ontology_schema,
      },
    });
    await store.append({
      type: "ouroboros_finished",
      seed_id: seedId,
      data: { converged: true, generation_count: 2 },
    });

    const lineage = await store.getLineage(seedId);
    expect(lineage.status).toBe("converged");
    expect(lineage.current_generation).toBe(2);
    expect(lineage.generations.map((g) => g.generation_number)).toEqual([1, 2]);
  });

  it("ignores malformed events and leaves lineage active without finished payload", async () => {
    const store = new InMemoryEventStore();
    const seedId = "seed-store-2";

    await store.append({
      type: "generation_completed",
      seed_id: seedId,
      data: { bad: "payload" },
    });
    await store.append({
      type: "ouroboros_finished",
      seed_id: seedId,
      data: { broken: true },
    });

    const lineage = await store.getLineage(seedId);
    expect(lineage.status).toBe("active");
    expect(lineage.current_generation).toBe(0);
    expect(lineage.generations).toHaveLength(0);
  });

  it("isolates events by seed id", async () => {
    const store = new InMemoryEventStore();
    const seedA = makeSeed("seed-A");
    const seedB = makeSeed("seed-B");

    await store.append({
      type: "generation_completed",
      seed_id: "seed-A",
      data: {
        generation_number: 1,
        seed: seedA,
        execution_output: "a",
        evaluation_summary: { final_approved: true, ac_results: [] },
        phase: "completed",
        ontology_schema: seedA.ontology_schema,
      },
    });
    await store.append({
      type: "generation_completed",
      seed_id: "seed-B",
      data: {
        generation_number: 1,
        seed: seedB,
        execution_output: "b",
        evaluation_summary: { final_approved: true, ac_results: [] },
        phase: "completed",
        ontology_schema: seedB.ontology_schema,
      },
    });

    const lineageA = await store.getLineage("seed-A");
    const lineageB = await store.getLineage("seed-B");
    expect(lineageA.generations).toHaveLength(1);
    expect(lineageB.generations).toHaveLength(1);
    expect(lineageA.generations[0].execution_output).toBe("a");
    expect(lineageB.generations[0].execution_output).toBe("b");
  });
});
