import { describe, expect, it } from "vitest";
import { ConvergenceCriteria, RegressionDetector } from "./convergence.js";
import type { OntologyLineage } from "./lineage.js";
import type { Seed } from "./seed.js";

function minimalSeed(overrides: Partial<Seed> = {}): Seed {
  const base: Seed = {
    goal: "test",
    task_type: "code",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: [],
    ontology_schema: {
      name: "o",
      description: "d",
      fields: [{ name: "a", field_type: "string", description: "alpha", required: true }],
    },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: "seed_root",
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
    },
  };
  return { ...base, ...overrides, metadata: { ...base.metadata, ...overrides.metadata } };
}

function lineageFromFieldsList(
  seedId: string,
  fieldSets: Seed["ontology_schema"]["fields"][],
): OntologyLineage {
  const generations = fieldSets.map((fields, i) => ({
    generation_number: i + 1,
    seed: minimalSeed({ ontology_schema: { name: "o", description: "d", fields } }),
    phase: "completed" as const,
    ontology_schema: { name: "o", description: "d", fields },
    evaluation_summary: {
      final_approved: true,
      score: 0.95,
      ac_results: [{ ac_index: 0, ac_content: "c", passed: true, evidence: "e" }],
    },
  }));
  return {
    seed_id: seedId,
    current_generation: generations.length,
    generations,
    status: "active",
  };
}

describe("RegressionDetector", () => {
  it("flags AC that passed before and fails now", () => {
    const det = new RegressionDetector();
    const g1 = {
      generation_number: 1,
      seed: minimalSeed(),
      phase: "completed" as const,
      ontology_schema: minimalSeed().ontology_schema,
      evaluation_summary: {
        final_approved: false,
        ac_results: [{ ac_index: 0, ac_content: "x", passed: true, evidence: "" }],
      },
    };
    const g2 = {
      generation_number: 2,
      seed: minimalSeed(),
      phase: "completed" as const,
      ontology_schema: minimalSeed().ontology_schema,
      evaluation_summary: {
        final_approved: false,
        ac_results: [{ ac_index: 0, ac_content: "x", passed: false, evidence: "" }],
      },
    };
    const r = det.detect({
      seed_id: "s",
      current_generation: 2,
      status: "active",
      generations: [g1, g2],
    });
    expect(r.has_regressions).toBe(true);
    expect(r.regressed_ac_indices).toEqual([0]);
  });
});

describe("ConvergenceCriteria", () => {
  it("does not converge before minGenerations", () => {
    const c = new ConvergenceCriteria({ minGenerations: 2 });
    const lin = lineageFromFieldsList("id", [
      [{ name: "a", field_type: "string", description: "same words here", required: true }],
    ]);
    const sig = c.evaluate(lin, undefined, lin.generations[0].evaluation_summary);
    expect(sig.converged).toBe(false);
    expect(sig.reason).toContain("Below minimum");
  });

  it("converges when ontology is stable and gates pass", () => {
    const fields = [
      { name: "a", field_type: "string", description: "identical description text", required: true },
    ];
    const lin = lineageFromFieldsList("id", [fields, fields]);
    const c = new ConvergenceCriteria({
      minGenerations: 2,
      convergenceThreshold: 0.9,
      evalGateEnabled: true,
      evalMinScore: 0.5,
    });
    const latest = lin.generations[1].evaluation_summary!;
    const sig = c.evaluate(lin, { requires_evolution: false }, latest);
    expect(sig.converged).toBe(true);
    expect(sig.ontology_similarity).toBeGreaterThanOrEqual(0.9);
  });
});
