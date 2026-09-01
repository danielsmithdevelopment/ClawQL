import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "clawql-core";
import { coldStartTasksFromTools, toBenchmarkTask } from "./scenario-synthesis-bridge.js";
import { synthesizeScenarios } from "clawql-core";

const tools: ToolDefinition[] = [
  {
    name: "alpha",
    description: "Alpha op",
    schema: { type: "object", properties: { id: { type: "string" } } },
    handler: async () => ({ content: [{ type: "text", text: "a" }] }),
  },
  {
    name: "beta",
    description: "Beta op",
    schema: { type: "object", properties: { id: { type: "string" } } },
    handler: async () => ({ content: [{ type: "text", text: "b" }] }),
  },
];

describe("scenario synthesis → harness bridge", () => {
  it("produces benchmark tasks from tool specs", async () => {
    const tasks = await coldStartTasksFromTools("demo", tools);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.every((t) => t.id && t.title && (t.maxTurns ?? 0) >= 1)).toBe(true);
  });

  it("toBenchmarkTask preserves scenario id/title", async () => {
    const [scenario] = await synthesizeScenarios({
      pluginId: "demo",
      tools: [tools[0]!],
      gradedComplexity: ["simple"],
    });
    const task = toBenchmarkTask(scenario!);
    expect(task.id).toBe(scenario!.scenarioId);
    expect(task.title).toBe(scenario!.userIntent);
  });
});
