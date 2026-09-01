/**
 * Cold-start scenario synthesis from tool specs (Agent Seer / spec §9).
 * Deterministic, best-effort — no live tool execution; optional LLM port later.
 */

import { createHash } from "node:crypto";
import { Effect } from "effect";
import type { ToolDefinition } from "./provider-types.js";

export type ScenarioComplexity = "simple" | "multi-tool";

export type ScenarioSynthesisRequest = {
  readonly pluginId: string;
  readonly tools: readonly ToolDefinition[];
  /** Default: `["simple"]`. */
  readonly gradedComplexity?: readonly ScenarioComplexity[];
  readonly multiTurn?: boolean;
};

export type ExpectedToolCall = {
  readonly toolId: string;
  readonly args: Record<string, unknown>;
};

export type SynthesizedTurn = {
  readonly role: "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCall?: ExpectedToolCall;
};

export type SynthesizedScenario = {
  readonly scenarioId: string;
  readonly userIntent: string;
  readonly expectedToolSequence: readonly ExpectedToolCall[];
  readonly mockToolOutputs: readonly Record<string, unknown>[];
  readonly turns?: readonly SynthesizedTurn[];
  readonly complexity: ScenarioComplexity;
  readonly pluginId: string;
};

function shortDigest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 12);
}

/** Prefer parameterNotes keys; else JSON Schema properties; else Zod-shape keys. */
export function listToolParameterNames(tool: ToolDefinition): readonly string[] {
  if (tool.parameterNotes && Object.keys(tool.parameterNotes).length > 0) {
    return Object.keys(tool.parameterNotes);
  }
  const schema = tool.schema ?? {};
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (props && typeof props === "object") {
    return Object.keys(props);
  }
  return Object.keys(schema).filter((k) => !k.startsWith("_") && k !== "type" && k !== "$schema");
}

function exampleArgValue(tool: ToolDefinition, name: string): unknown {
  const note = tool.parameterNotes?.[name];
  if (note?.trim()) {
    // Prefer a short literal-ish token from the note when present.
    const quoted = note.match(/["']([^"']+)["']/);
    if (quoted?.[1]) return quoted[1];
    return `note:${name}`;
  }
  const schema = tool.schema ?? {};
  const props = (schema as { properties?: Record<string, { type?: string }> }).properties;
  const propType = props?.[name]?.type;
  switch (propType) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return `example-${name}`;
  }
}

export function synthesizeArgsForTool(tool: ToolDefinition): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const name of listToolParameterNames(tool)) {
    args[name] = exampleArgValue(tool, name);
  }
  return args;
}

function mockOutputForTool(
  tool: ToolDefinition,
  args: Record<string, unknown>
): Record<string, unknown> {
  return {
    ok: true,
    tool: tool.name,
    echoArgs: args,
    synthetic: true,
  };
}

function intentForTool(tool: ToolDefinition): string {
  const desc = tool.description?.trim();
  if (desc) return `Use ${tool.name}: ${desc}`;
  const notes = tool.parameterNotes
    ? Object.entries(tool.parameterNotes)
        .map(([k, v]) => `${k} (${v})`)
        .join("; ")
    : "";
  return notes
    ? `Call ${tool.name} with careful args: ${notes}`
    : `Call ${tool.name} with valid arguments`;
}

function simpleScenario(pluginId: string, tool: ToolDefinition): SynthesizedScenario {
  const args = synthesizeArgsForTool(tool);
  const call: ExpectedToolCall = { toolId: tool.name, args };
  const scenarioId = `synth-${pluginId}-${shortDigest([tool.name, "simple"])}`;
  return {
    scenarioId,
    pluginId,
    complexity: "simple",
    userIntent: intentForTool(tool),
    expectedToolSequence: [call],
    mockToolOutputs: [mockOutputForTool(tool, args)],
  };
}

function multiToolScenario(
  pluginId: string,
  tools: readonly ToolDefinition[]
): SynthesizedScenario | undefined {
  if (tools.length < 2) return undefined;
  const selected = tools.slice(0, Math.min(3, tools.length));
  const sequence: ExpectedToolCall[] = [];
  const mocks: Record<string, unknown>[] = [];
  for (const tool of selected) {
    const args = synthesizeArgsForTool(tool);
    sequence.push({ toolId: tool.name, args });
    mocks.push(mockOutputForTool(tool, args));
  }
  const names = selected.map((t) => t.name).join(" → ");
  return {
    scenarioId: `synth-${pluginId}-${shortDigest([...selected.map((t) => t.name), "multi"])}`,
    pluginId,
    complexity: "multi-tool",
    userIntent: `Complete a multi-step workflow using ${names}`,
    expectedToolSequence: sequence,
    mockToolOutputs: mocks,
  };
}

function withTurns(scenario: SynthesizedScenario): SynthesizedScenario {
  const turns: SynthesizedTurn[] = [{ role: "user", content: scenario.userIntent }];
  for (let i = 0; i < scenario.expectedToolSequence.length; i++) {
    const call = scenario.expectedToolSequence[i]!;
    turns.push({
      role: "assistant",
      content: `Calling ${call.toolId}`,
      toolCall: call,
    });
    turns.push({
      role: "tool",
      content: JSON.stringify(scenario.mockToolOutputs[i] ?? { ok: true }),
    });
  }
  turns.push({
    role: "assistant",
    content: "Task complete (synthetic cold-start scenario).",
  });
  return { ...scenario, turns };
}

/**
 * Synthesize graded scenarios from tool definitions alone (Effect — sync body).
 * Empty tools → empty list. Does not call live handlers or network.
 */
export function synthesizeScenariosEffect(
  request: ScenarioSynthesisRequest
): Effect.Effect<readonly SynthesizedScenario[], never> {
  return Effect.sync(() => {
    const tools = request.tools.filter((t) => t.name.trim().length > 0);
    if (tools.length === 0) return [];

    const grades = request.gradedComplexity ?? (["simple"] as const);
    const out: SynthesizedScenario[] = [];

    if (grades.includes("simple")) {
      for (const tool of tools) {
        out.push(simpleScenario(request.pluginId, tool));
      }
    }
    if (grades.includes("multi-tool")) {
      const multi = multiToolScenario(request.pluginId, tools);
      if (multi) out.push(multi);
    }

    if (request.multiTurn) {
      return out.map(withTurns);
    }
    return out;
  });
}

/** Promise façade for harness / CLI. */
export function synthesizeScenarios(
  request: ScenarioSynthesisRequest
): Promise<readonly SynthesizedScenario[]> {
  return Effect.runPromise(synthesizeScenariosEffect(request));
}

/**
 * Map a synthesized scenario to a harness {@link BenchmarkTask}-shaped object
 * without importing clawql-harness (keep clawql-core free of harness deps).
 */
export function synthesizedScenarioToHarnessTask(scenario: SynthesizedScenario): {
  readonly id: string;
  readonly title: string;
  readonly maxTurns: number;
} {
  const maxTurns =
    scenario.turns?.filter((t) => t.role === "assistant" && t.toolCall).length ??
    Math.max(1, scenario.expectedToolSequence.length);
  return {
    id: scenario.scenarioId,
    title: scenario.userIntent,
    maxTurns,
  };
}
