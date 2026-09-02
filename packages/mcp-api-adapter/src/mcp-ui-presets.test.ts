import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import type { ListedMcpTool } from "mcp-grpc-transport";
import {
  AGENT_LAB_PRESET_SLUG,
  McpUiPresetError,
  resolveAgentLabPresetDefinition,
  runResolveAgentLabPreset,
} from "./mcp-ui-presets.js";

function tool(name: string): ListedMcpTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object", properties: {} },
  };
}

describe("agent-lab mcp-ui preset", () => {
  it("prefers docs_* tools when present", () => {
    const def = runResolveAgentLabPreset([
      tool("docs_search"),
      tool("docs_list_routes"),
      tool("docs_reveal_agent_lab"),
      tool("docs_claim_starter_pack"),
      tool("search"),
    ]);
    expect(def.slug).toBe(AGENT_LAB_PRESET_SLUG);
    expect(def.steps.map((s) => s.tool)).toEqual([
      "docs_search",
      "docs_list_routes",
      "docs_reveal_agent_lab",
      "docs_claim_starter_pack",
    ]);
  });

  it("falls back to Core search + memory_recall", () => {
    const def = runResolveAgentLabPreset([
      tool("search"),
      tool("memory_recall"),
    ]);
    expect(def.steps.map((s) => s.tool)).toEqual([
      "search",
      "memory_recall",
    ]);
  });

  it("fails when fewer than two tools match", async () => {
    const result = await Effect.runPromise(
      Effect.either(resolveAgentLabPresetDefinition([tool("echo")]))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(McpUiPresetError);
    }
  });
});
