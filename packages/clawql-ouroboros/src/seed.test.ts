import { describe, expect, it } from "vitest";
import { SeedSchema } from "./seed.js";

const baseSeed = {
  goal: "Do a thing",
  task_type: "analysis" as const,
  brownfield_context: {
    project_type: "greenfield" as const,
    context_references: [],
    existing_patterns: [],
    existing_dependencies: [],
  },
  constraints: [],
  acceptance_criteria: ["ok"],
  ontology_schema: { name: "O", description: "d", fields: [] },
  evaluation_principles: [],
  exit_conditions: [],
  metadata: {
    seed_id: "seed_test",
    version: "1.0.0",
    created_at: "2026-01-01T00:00:00.000Z",
    ambiguity_score: 0.1,
    interview_id: null,
    parent_seed_id: null,
  },
};

describe("SeedSchema.strict()", () => {
  it("accepts a valid seed", () => {
    expect(SeedSchema.parse(baseSeed).goal).toBe("Do a thing");
  });

  it("rejects unknown top-level keys", () => {
    expect(() => SeedSchema.parse({ ...baseSeed, extra_top: true })).toThrow();
  });

  it("strips unknown nested keys under metadata (non-strict nested schemas)", () => {
    const parsed = SeedSchema.parse({
      ...baseSeed,
      metadata: { ...baseSeed.metadata, unexpected_nested: "x" },
    });
    expect((parsed.metadata as { unexpected_nested?: string }).unexpected_nested).toBeUndefined();
  });
});
