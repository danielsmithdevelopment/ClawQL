/**
 * Map clawql-core synthesized scenarios → harness BenchmarkTask for cold-start benches.
 */

import {
  synthesizeScenariosEffect,
  synthesizedScenarioToHarnessTask,
  type ScenarioSynthesisRequest,
  type SynthesizedScenario,
  type ToolDefinition,
} from "clawql-core";
import { Effect } from "effect";
import type { BenchmarkTask } from "../src/types.js";

export type { SynthesizedScenario, ScenarioSynthesisRequest };

/** Convert one synthesized scenario into a harness benchmark task. */
export function toBenchmarkTask(scenario: SynthesizedScenario): BenchmarkTask {
  return synthesizedScenarioToHarnessTask(scenario);
}

/** Synthesize scenarios then map each to a BenchmarkTask. */
export function synthesizeBenchmarkTasksEffect(
  request: ScenarioSynthesisRequest
): Effect.Effect<readonly BenchmarkTask[], never> {
  return Effect.gen(function* () {
    const scenarios = yield* synthesizeScenariosEffect(request);
    return scenarios.map(toBenchmarkTask);
  });
}

export async function synthesizeBenchmarkTasks(
  request: ScenarioSynthesisRequest
): Promise<readonly BenchmarkTask[]> {
  return Effect.runPromise(synthesizeBenchmarkTasksEffect(request));
}

/** Convenience: tools-only entry for plugin authors. */
export async function coldStartTasksFromTools(
  pluginId: string,
  tools: readonly ToolDefinition[],
  options?: Omit<ScenarioSynthesisRequest, "pluginId" | "tools">
): Promise<readonly BenchmarkTask[]> {
  return synthesizeBenchmarkTasks({
    pluginId,
    tools,
    gradedComplexity: options?.gradedComplexity ?? ["simple", "multi-tool"],
    multiTurn: options?.multiTurn ?? true,
  });
}
