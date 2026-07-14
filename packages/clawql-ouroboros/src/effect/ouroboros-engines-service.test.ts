import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import type { Seed } from "../seed.js";
import {
  OuroborosEnginesService,
  ouroborosEnginesLiveLayer,
  resetOuroborosEnginesForTests,
} from "./ouroboros-engines-service.js";

function minimalSeed(seedId: string): Seed {
  return {
    goal: "engines service test",
    task_type: "analysis",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: ["must produce output"],
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

describe("OuroborosEnginesService", () => {
  afterEach(() => {
    resetOuroborosEnginesForTests();
  });

  it("provides default engines and execute/evaluate Effect methods", async () => {
    const seed = minimalSeed("seed-engines");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const engines = yield* OuroborosEnginesService;
        const output = yield* engines.execute(seed);
        const evaluation = yield* engines.evaluate(output, seed);
        return { output, evaluation, bundle: engines.getEngines() };
      }).pipe(Effect.provide(ouroborosEnginesLiveLayer()))
    );

    expect(result.output).toContain("clawql-ouroboros-default-execute");
    expect(result.evaluation.final_approved).toBeTypeOf("boolean");
    expect(result.bundle.wonder).toBeDefined();
    expect(result.bundle.reflect).toBeDefined();
    expect(result.bundle.execute).toBeDefined();
    expect(result.bundle.evaluate).toBeDefined();
  });
});
