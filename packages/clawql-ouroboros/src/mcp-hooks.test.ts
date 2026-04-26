import { describe, expect, it, vi } from "vitest";
import { ouroborosMcpTools } from "./mcp-hooks.js";
import type { Seed } from "./seed.js";

function minimalSeed(seedId: string): Seed {
  return {
    goal: "mcp test",
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

describe("ouroborosMcpTools", () => {
  it("createSeedFromDocument builds a valid seed with goal hint override", async () => {
    const result = await ouroborosMcpTools.createSeedFromDocument.handler(
      {
        documentId: "doc-1",
        extractedText: "Cloudflare GitHub workflow release and rollback checklist",
        goalHint: "Custom goal",
        metadata: { title: "Ignored title" },
        taskType: "analysis",
      },
      {} as never,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.seed.goal).toBe("Custom goal");
      expect(result.seed.brownfield_context.context_references).toContain("doc-1");
      expect(result.seed.ontology_schema.fields.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("runEvolutionaryLoop reflects converged/exhausted summary from loop result", async () => {
    const loopRun = vi
      .fn()
      .mockResolvedValueOnce({
        converged: true,
        generations: [{}, {}],
        finalSeed: minimalSeed("seed-ok"),
        lineage: { seed_id: "seed-ok", status: "converged" },
      })
      .mockResolvedValueOnce({
        converged: false,
        generations: [{}],
        finalSeed: minimalSeed("seed-no"),
        lineage: { seed_id: "seed-no", status: "exhausted" },
      });
    const context = {
      ouroborosLoop: { run: loopRun },
      eventStore: { getLineage: vi.fn() },
    } as never;

    const input = {
      seed: minimalSeed("seed-in"),
      maxGenerations: 2,
      convergenceThreshold: 0.9,
    };

    const convergedRes = await ouroborosMcpTools.runEvolutionaryLoop.handler(input, context);
    const exhaustedRes = await ouroborosMcpTools.runEvolutionaryLoop.handler(input, context);

    expect(convergedRes.converged).toBe(true);
    expect(convergedRes.summary).toContain("Converged");
    expect(exhaustedRes.converged).toBe(false);
    expect(exhaustedRes.summary).toContain("Exhausted");
  });

  it("getLineageStatus proxies event store result", async () => {
    const getLineage = vi.fn().mockResolvedValue({
      seed_id: "seed-lineage",
      current_generation: 3,
      generations: [],
      status: "active",
    });

    const context = {
      ouroborosLoop: { run: vi.fn() },
      eventStore: { getLineage },
    } as never;

    const res = await ouroborosMcpTools.getLineageStatus.handler({ seedId: "seed-lineage" }, context);
    expect(getLineage).toHaveBeenCalledWith("seed-lineage");
    expect(res.seed_id).toBe("seed-lineage");
  });
});
