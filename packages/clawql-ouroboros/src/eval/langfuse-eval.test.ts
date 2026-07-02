import { describe, expect, it, vi } from "vitest";
import { InMemoryEventStore } from "../in-memory-event-store.js";
import type { Seed } from "../seed.js";
import { normalizeLangfuseEvalPayload } from "./langfuse-normalize.js";
import {
  buildSeedRevisionProposal,
  langfuseEvalAutoApplyEnabled,
  parseLangfuseMinScore,
  processLangfuseEval,
} from "./seed-revision.js";

function minimalSeed(seedId: string): Seed {
  return {
    goal: "eval test",
    task_type: "analysis",
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
      fields: [],
    },
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

describe("normalizeLangfuseEvalPayload", () => {
  it("parses nested Langfuse score shape", () => {
    const n = normalizeLangfuseEvalPayload({
      score: { name: "accuracy", value: 0.92, comment: "good" },
      trace: { id: "tr-1", metadata: { seed_id: "seed_root" } },
    });
    expect(n).toEqual(
      expect.objectContaining({
        scoreName: "accuracy",
        scoreValue: 0.92,
        traceId: "tr-1",
        seedId: "seed_root",
        comment: "good",
      })
    );
  });

  it("returns null when no score value", () => {
    expect(normalizeLangfuseEvalPayload({ foo: "bar" })).toBeNull();
  });
});

describe("buildSeedRevisionProposal", () => {
  it("returns ticket when score below threshold", () => {
    const p = buildSeedRevisionProposal(
      {
        scoreName: "accuracy",
        scoreValue: 0.5,
        metadata: {},
      },
      minimalSeed("seed_a"),
      0.8
    );
    expect(p.action).toBe("ticket");
  });

  it("proposes principles patch when score meets threshold", () => {
    const p = buildSeedRevisionProposal(
      {
        scoreName: "accuracy",
        scoreValue: 0.95,
        traceId: "tr-2",
        metadata: {},
      },
      minimalSeed("seed_b"),
      0.8
    );
    expect(p.action).toBe("proposed");
    expect(p.patch?.evaluation_principles?.length).toBe(1);
    expect(p.patch?.acceptance_criteria?.length).toBe(1);
  });
});

describe("processLangfuseEval", () => {
  it("dry-runs by default (proposed, no revised seed)", async () => {
    const store = new InMemoryEventStore();
    const base = minimalSeed("seed_root");

    const result = await processLangfuseEval(
      {
        scoreName: "accuracy",
        scoreValue: 0.95,
        seedId: "seed_root",
        metadata: {},
      },
      {
        minScore: 0.8,
        autoApply: false,
        eventStore: store,
        loadSeedByLineageId: vi.fn().mockResolvedValue(base),
      }
    );

    expect(result.ok).toBe(true);
    expect(result.action).toBe("proposed");
    expect(result.dryRun).toBe(true);
    expect(result.revisedSeed).toBeUndefined();
  });

  it("applies revision when autoApply is true", async () => {
    const store = new InMemoryEventStore();
    const base = minimalSeed("seed_apply");

    const result = await processLangfuseEval(
      {
        scoreName: "accuracy",
        scoreValue: 0.99,
        seedId: "seed_apply",
        metadata: {},
      },
      {
        minScore: 0.8,
        autoApply: true,
        eventStore: store,
        baseSeed: base,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.action).toBe("applied");
    expect(result.revisedSeed?.metadata.version).toBe("1.0.1");
    expect(result.revisedSeed?.metadata.parent_seed_id).toBe("seed_apply");
  });
});

describe("env helpers", () => {
  it("parseLangfuseMinScore defaults to 0.8", () => {
    expect(parseLangfuseMinScore({})).toBe(0.8);
    expect(parseLangfuseMinScore({ CLAWQL_LANGFUSE_EVAL_MIN_SCORE: "0.7" })).toBe(0.7);
  });

  it("langfuseEvalAutoApplyEnabled is false unless explicit", () => {
    expect(langfuseEvalAutoApplyEnabled({})).toBe(false);
    expect(langfuseEvalAutoApplyEnabled({ CLAWQL_LANGFUSE_EVAL_AUTO_APPLY: "1" })).toBe(true);
  });
});
