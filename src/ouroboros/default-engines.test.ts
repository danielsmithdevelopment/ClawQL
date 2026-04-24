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
    const parsed = JSON.parse(output) as { route: string; result: string | null; operationId: string };

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
    const parsed = JSON.parse(output) as { route: string; result: string | null; searchQuery: string };

    expect(parsed.route).toBe("search");
    expect(parsed.searchQuery).toBe("find pet APIs");
    expect(parsed.result).toBe("search-result");
    expect(search).toHaveBeenCalledWith("find pet APIs", 3);
    expect(execute).not.toHaveBeenCalled();
  });
});
