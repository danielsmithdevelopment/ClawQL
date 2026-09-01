/**
 * Host helpers — inference model hooks + scenario synthesis from a live ClawQLApiHandle.
 */

import {
  synthesizeScenariosEffect,
  type ScenarioSynthesisRequest,
  type SynthesizedScenario,
} from "clawql-core";
import { Effect } from "effect";
import type { ClawQLApiHandle } from "./create-api.js";

/**
 * Build options for `createInferenceGateway({ modelHooks })` from a live API handle.
 * Shape matches clawql-inference `HookedInferenceGatewayOptions`.
 */
export function modelHooksFromClawqlApi(
  handle: ClawQLApiHandle,
  atrScopeTokens?: readonly string[]
): {
  readonly hookRegistry: ClawQLApiHandle["hookRegistry"];
  readonly worm: ClawQLApiHandle["worm"];
  readonly atrScopeTokens?: readonly string[];
} {
  return {
    hookRegistry: handle.hookRegistry,
    worm: handle.worm,
    ...(atrScopeTokens ? { atrScopeTokens } : {}),
  };
}

export type HostModelHooks = ReturnType<typeof modelHooksFromClawqlApi>;

/** Synthesize cold-start scenarios from tools currently registered on the handle. */
export function synthesizeScenariosFromApiEffect(
  handle: ClawQLApiHandle,
  options?: Omit<ScenarioSynthesisRequest, "pluginId" | "tools"> & {
    readonly pluginId?: string;
  }
): Effect.Effect<readonly SynthesizedScenario[], never> {
  const tools = handle.mcpTools.listForSynthesis();
  return synthesizeScenariosEffect({
    pluginId: options?.pluginId ?? "host",
    tools,
    gradedComplexity: options?.gradedComplexity ?? ["simple", "multi-tool"],
    multiTurn: options?.multiTurn ?? true,
  });
}

export async function synthesizeScenariosFromApi(
  handle: ClawQLApiHandle,
  options?: Omit<ScenarioSynthesisRequest, "pluginId" | "tools"> & {
    readonly pluginId?: string;
  }
): Promise<readonly SynthesizedScenario[]> {
  return Effect.runPromise(synthesizeScenariosFromApiEffect(handle, options));
}
