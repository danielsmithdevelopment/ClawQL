import { describe, expect, it } from "vitest";
import { EvolutionaryLoop } from "./evolutionary-loop.js";
import { InMemoryEventStore } from "./in-memory-event-store.js";
import type { Seed } from "./seed.js";

function fixtureSeed(): Seed {
  return {
    goal: "loop test",
    task_type: "code",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: ["always"],
    ontology_schema: {
      name: "ont",
      description: "d",
      fields: [
        { name: "f1", field_type: "string", description: "field one description", required: true },
      ],
    },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: "seed_fixture_root",
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
    },
  };
}

describe("EvolutionaryLoop", () => {
  it("runs until convergence when similarity and eval pass", async () => {
    const store = new InMemoryEventStore();
    let calls = 0;
    const loop = new EvolutionaryLoop(
      store,
      {
        wonder: async () => ({
          insights: [],
          suggested_refinements: [],
          requires_evolution: false,
        }),
      },
      {
        reflect: async () => ({
          newSeedData: {},
          rationale: "noop",
        }),
      },
      {
        execute: async () => {
          calls++;
          return "ok";
        },
      },
      {
        evaluate: async () => ({
          final_approved: true,
          score: 0.95,
          ac_results: [{ ac_index: 0, ac_content: "always", passed: true, evidence: "ok" }],
        }),
      },
      {
        minGenerations: 2,
        maxGenerations: 10,
        convergenceThreshold: 0.95,
        evalMinScore: 0.7,
      },
    );

    const result = await loop.run(fixtureSeed());
    expect(result.converged).toBe(true);
    expect(result.generations.length).toBeGreaterThanOrEqual(2);
    expect(calls).toBe(result.generations.length);
    expect(result.lineage.status).toBe("converged");
    expect(result.lineage.generations.length).toBe(result.generations.length);
  });

  it("respects maxGenerations override (hard cap terminates the loop)", async () => {
    const store = new InMemoryEventStore();
    const loop = new EvolutionaryLoop(
      store,
      {
        wonder: async () => ({
          insights: [],
          suggested_refinements: [],
          requires_evolution: true,
        }),
      },
      {
        reflect: async (seed) => ({
          newSeedData: {
            ontology_schema: {
              ...seed.ontology_schema,
              fields: [
                {
                  name: `f${Math.random()}`,
                  field_type: "string",
                  description: "new",
                  required: true,
                },
              ],
            },
          },
          rationale: "mutate",
        }),
      },
      { execute: async () => "x" },
      {
        evaluate: async () => ({
          final_approved: false,
          score: 0.1,
          ac_results: [{ ac_index: 0, ac_content: "c", passed: false, evidence: "" }],
        }),
      },
      { maxGenerations: 100 },
    );

    const result = await loop.run(fixtureSeed(), { maxGenerations: 3 });
    expect(result.generations.length).toBe(3);
    expect(result.converged).toBe(false);
    expect(result.lineage.status).toBe("exhausted");
  });
});
