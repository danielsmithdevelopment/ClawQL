import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "./provider-types.js";
import {
  listToolParameterNames,
  synthesizeArgsForTool,
  synthesizeScenarios,
  synthesizedScenarioToHarnessTask,
} from "./scenario-synthesis.js";

const ping: ToolDefinition = {
  name: "demo_ping",
  description: "Ping the demo service",
  schema: {
    type: "object",
    properties: {
      message: { type: "string" },
      count: { type: "integer" },
    },
  },
  handler: async () => ({ content: [{ type: "text", text: "pong" }] }),
  parameterNotes: {
    message: 'Prefer short status strings like "ok"',
    count: "Retry count; usually 1",
  },
};

const echo: ToolDefinition = {
  name: "demo_echo",
  description: "Echo payload",
  schema: {
    type: "object",
    properties: { payload: { type: "string" } },
  },
  handler: async () => ({ content: [{ type: "text", text: "echo" }] }),
};

describe("scenario synthesis (Agent Seer §9)", () => {
  it("lists params from parameterNotes first", () => {
    expect(listToolParameterNames(ping)).toEqual(["message", "count"]);
  });

  it("uses notes when synthesizing args", () => {
    const args = synthesizeArgsForTool(ping);
    expect(args.message).toBe("ok");
    expect(args.count).toBe("note:count");
  });

  it("synthesizes simple and multi-tool scenarios", async () => {
    const scenarios = await synthesizeScenarios({
      pluginId: "demo",
      tools: [ping, echo],
      gradedComplexity: ["simple", "multi-tool"],
      multiTurn: true,
    });
    expect(scenarios.some((s) => s.complexity === "simple")).toBe(true);
    expect(scenarios.some((s) => s.complexity === "multi-tool")).toBe(true);
    const multi = scenarios.find((s) => s.complexity === "multi-tool");
    expect(multi?.expectedToolSequence.length).toBeGreaterThanOrEqual(2);
    expect(multi?.turns?.length).toBeGreaterThan(2);
    const task = synthesizedScenarioToHarnessTask(multi!);
    expect(task.id).toBe(multi!.scenarioId);
    expect(task.maxTurns).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for empty tools", async () => {
    expect(await synthesizeScenarios({ pluginId: "x", tools: [] })).toEqual([]);
  });
});
