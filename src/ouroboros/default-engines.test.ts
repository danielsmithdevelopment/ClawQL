import { describe, expect, it, vi } from "vitest";
import { createDefaultOuroborosEngines } from "./default-engines.js";

function makeSeed(metadata: Record<string, unknown>) {
  return {
    goal: "test goal",
    task_type: "analysis",
    brownfield_context: {
      project_type: "brownfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: ["must return output"],
    ontology_schema: {
      name: "TestOntology",
      description: "test",
      fields: [
        {
          name: "value",
          field_type: "string",
          description: "value",
          required: true,
        },
      ],
    },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: "seed-1",
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
      ...metadata,
    },
  };
}

describe("createDefaultOuroborosEngines", () => {
  it("routes executor through internal execute bridge when operationId is present", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text", text: '{"ok":true}' }],
    }));
    const search = vi.fn();
    const engines = createDefaultOuroborosEngines({ execute, search });

    const output = await engines.execute.execute(
      makeSeed({
        operationId: "pets/list",
        args: { limit: 1 },
        fields: ["name"],
      })
    );
    const parsed = JSON.parse(output) as {
      route: string;
      result: string | null;
      operationId: string;
    };

    expect(parsed.route).toBe("execute");
    expect(parsed.operationId).toBe("pets/list");
    expect(parsed.result).toBe('{"ok":true}');
    expect(execute).toHaveBeenCalledWith({
      operationId: "pets/list",
      args: { limit: 1 },
      fields: ["name"],
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("routes executor through internal search bridge when searchQuery is present", async () => {
    const search = vi.fn(async () => ({
      content: [{ type: "text", text: "search-result" }],
    }));
    const execute = vi.fn();
    const engines = createDefaultOuroborosEngines({ execute, search });

    const output = await engines.execute.execute(
      makeSeed({
        searchQuery: "find pet APIs",
        searchLimit: 3,
      })
    );
    const parsed = JSON.parse(output) as {
      route: string;
      result: string | null;
      searchQuery: string;
    };

    expect(parsed.route).toBe("search");
    expect(parsed.searchQuery).toBe("find pet APIs");
    expect(parsed.result).toBe("search-result");
    expect(search).toHaveBeenCalledWith("find pet APIs", 3);
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes all context_references route hints in order", async () => {
    const execute = vi.fn(async ({ operationId }: { operationId: string }) => ({
      content: [{ type: "text", text: JSON.stringify({ provider: operationId.split("/")[0] }) }],
    }));
    const search = vi.fn(async () => ({
      content: [{ type: "text", text: "search-result" }],
    }));
    const engines = createDefaultOuroborosEngines({ execute, search });
    const seed = makeSeed({});
    seed.brownfield_context.context_references = [
      { clawql_execute: { operationId: "github/repos-list", args: { owner: "o" } } },
      { clawql_search: { query: "cloudflare zones list", limit: 2 } },
      { clawql_execute: { operationId: "cloudflare/zones-get", args: {} } },
    ];

    const output = await engines.execute.execute(seed);
    const parsed = JSON.parse(output) as {
      route: string;
      steps: Array<{ route: string }>;
    };

    expect(parsed.route).toBe("multi");
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps.map((s) => s.route)).toEqual(["execute", "search", "execute"]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("fails provider-specific ACs when execution evidence misses a provider", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text", text: '{"ok":true,"provider":"github"}' }],
    }));
    const engines = createDefaultOuroborosEngines({ execute, search: vi.fn() });
    const seed = makeSeed({
      operationId: "github/repos-list",
    });
    seed.acceptance_criteria = [
      "GitHub commits are returned",
      "Cloudflare zone list call succeeds without auth errors",
    ];

    const output = await engines.execute.execute(seed);
    const evaluation = await engines.evaluate.evaluate(output, seed);

    expect(evaluation.final_approved).toBe(false);
    expect(evaluation.ac_results[0].passed).toBe(true);
    expect(evaluation.ac_results[1].passed).toBe(false);
    expect(evaluation.ac_results[1].evidence).toContain("missing provider evidence");
  });

  it("does not treat goal text as provider execution evidence (no greenwash on substring)", async () => {
    const engines = createDefaultOuroborosEngines({ execute: vi.fn(), search: vi.fn() });
    const seed = makeSeed({});
    seed.acceptance_criteria = ["GitHub repos are listed", "Cloudflare zones-get succeeds"];
    const output = JSON.stringify({
      kind: "clawql-ouroboros-default-execute",
      goal: "Exercise github and cloudflare in one run",
      route: "execute",
      operationId: "repos/list-public",
      args: {},
      result: '{"data":[]}',
    });

    const evaluation = await engines.evaluate.evaluate(output, seed);
    expect(evaluation.final_approved).toBe(false);
    expect(evaluation.ac_results[0].passed).toBe(true);
    expect(evaluation.ac_results[1].passed).toBe(false);
    expect(evaluation.ac_results[1].evidence).toContain("missing provider evidence");
  });

  it("recognizes GitHub provider from single-route operationId style", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text", text: '{"ok":true}' }],
    }));
    const engines = createDefaultOuroborosEngines({ execute, search: vi.fn() });
    const seed = makeSeed({
      operationId: "repos/list-commits",
    });
    seed.acceptance_criteria = ["GitHub commits are returned"];

    const output = await engines.execute.execute(seed);
    const evaluation = await engines.evaluate.evaluate(output, seed);
    expect(evaluation.final_approved).toBe(true);
    expect(evaluation.ac_results[0].passed).toBe(true);
  });
});
