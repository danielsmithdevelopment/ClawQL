import { describe, expect, it } from "vitest";
import {
  DRIFT_THRESHOLD_ACCEPTABLE,
  DRIFT_THRESHOLD_EXCELLENT,
  classifyDriftBand,
  measureDrift,
} from "./drift.js";
import type { Seed } from "./seed.js";

function baselineSeed(overrides: Partial<Seed> = {}): Seed {
  const base: Seed = {
    goal: "Build a secure GitHub release workflow with rollback",
    task_type: "code",
    brownfield_context: {
      project_type: "brownfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: ["Never commit API tokens", "Use semver tags only"],
    acceptance_criteria: ["Workflow passes CI"],
    ontology_schema: {
      name: "ReleaseOntology",
      description: "Release automation concepts",
      fields: [
        {
          name: "workflow",
          field_type: "string",
          description: "GitHub Actions workflow",
          required: true,
        },
        {
          name: "rollback",
          field_type: "string",
          description: "Rollback procedure",
          required: true,
        },
        {
          name: "semver",
          field_type: "string",
          description: "Semantic version tag",
          required: true,
        },
      ],
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

describe("measureDrift", () => {
  it("returns near-zero component drift when output mirrors the seed vocabulary", () => {
    const seed = baselineSeed({
      goal: "workflow rollback semver",
      constraints: ["no api tokens", "semver tags only"],
      ontology_schema: {
        name: "ReleaseOntology",
        description: "d",
        fields: [
          { name: "workflow", field_type: "string", description: "workflow", required: true },
          { name: "rollback", field_type: "string", description: "rollback", required: true },
          { name: "semver", field_type: "string", description: "semver", required: true },
        ],
      },
    });

    const report = measureDrift({
      baselineSeed: seed,
      currentOutput: "workflow rollback semver with semver tags only and no api tokens",
      currentConcepts: ["workflow", "rollback", "semver"],
    });

    expect(report.goal_drift).toBeLessThan(0.2);
    expect(report.constraint_drift).toBeLessThan(0.2);
    expect(report.ontology_drift).toBeLessThan(0.2);
    expect(report.combined_drift).toBeLessThanOrEqual(DRIFT_THRESHOLD_EXCELLENT);
    expect(report.band).toBe("excellent");
  });

  it("increases constraint_drift when explicit violations are supplied", () => {
    const without = measureDrift({
      baselineSeed: baselineSeed({
        constraints: ["semver tags workflow"],
      }),
      currentOutput: "release semver tags workflow",
      currentConcepts: [],
    });
    const withViolations = measureDrift({
      baselineSeed: baselineSeed({
        constraints: ["semver tags workflow"],
      }),
      currentOutput: "release semver tags workflow",
      currentConcepts: [],
      constraintViolations: ["api token leaked"],
    });

    expect(without.constraint_drift).toBe(0);
    expect(withViolations.constraint_drift).toBe(0.2);
  });

  it("returns exceeded band when output diverges from goal and ontology", () => {
    const report = measureDrift({
      baselineSeed: baselineSeed(),
      currentOutput: "Refactored unrelated database schema for analytics dashboards.",
      constraintViolations: ["Never commit API tokens", "Use semver tags only"],
      currentConcepts: [],
    });

    expect(report.combined_drift).toBeGreaterThan(DRIFT_THRESHOLD_ACCEPTABLE);
    expect(report.band).toBe("exceeded");
  });

  it("uses upstream 50/30/20 weighting for combined score", () => {
    const report = measureDrift({
      baselineSeed: baselineSeed({
        constraints: [],
        ontology_schema: { name: "o", description: "d", fields: [] },
      }),
      currentOutput: "unrelated topic entirely",
    });

    const expected =
      0.5 * report.goal_drift + 0.3 * report.constraint_drift + 0.2 * report.ontology_drift;
    expect(report.combined_drift).toBeCloseTo(expected, 5);
  });
});

describe("classifyDriftBand", () => {
  it("maps threshold bands per upstream status skill", () => {
    expect(classifyDriftBand(0.12)).toBe("excellent");
    expect(classifyDriftBand(0.15)).toBe("excellent");
    expect(classifyDriftBand(0.22)).toBe("acceptable");
    expect(classifyDriftBand(0.3)).toBe("acceptable");
    expect(classifyDriftBand(0.31)).toBe("exceeded");
  });
});
