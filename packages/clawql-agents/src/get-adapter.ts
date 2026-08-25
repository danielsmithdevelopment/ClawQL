import { Effect, Layer } from "effect";
import { makeClineAdapterLayer, makeClineWormLayer } from "./adapters/cline/index.js";
import { makeDeepSeekAdapterLayer, makeDeepSeekWormLayer } from "./adapters/deepseek/index.js";
import { makeGooseAdapterLayer, makeGooseWormLayer } from "./adapters/goose/index.js";
import { makeHermesAdapterLayer, makeHermesWormLayer } from "./adapters/hermes/index.js";
import { makeOpenClawAdapterLayer, makeOpenClawWormLayer } from "./adapters/openclaw/index.js";
import { makeOpenHandsAdapterLayer, makeOpenHandsWormLayer } from "./adapters/openhands/index.js";
import { makePiAdapterLayer, makePiWormLayer } from "./adapters/pi/index.js";
import type { AgentName } from "./shared/types.js";
import { AgentAdapter } from "./shared/types.js";

export type AdapterBundle = {
  readonly wormLayer: ReturnType<typeof makeClineWormLayer>;
  readonly adapterLayer: Layer.Layer<AgentAdapter>;
};

/** All seven RockYourLobster catalog agents (Phases 1–4). */
export const IMPLEMENTED_AGENTS: readonly AgentName[] = [
  "cline",
  "openclaw",
  "hermes",
  "goose",
  "openhands",
  "pi",
  "deepseek",
];

/**
 * Resolve adapter + local WORM layers for a catalog agent.
 */
export const getAdapterBundle = (
  agentName: AgentName,
  wormDbPath: string
): Effect.Effect<AdapterBundle> =>
  Effect.sync(() => {
    switch (agentName) {
      case "cline":
        return {
          wormLayer: makeClineWormLayer(wormDbPath),
          adapterLayer: makeClineAdapterLayer(),
        };
      case "openclaw":
        return {
          wormLayer: makeOpenClawWormLayer(wormDbPath),
          adapterLayer: makeOpenClawAdapterLayer(),
        };
      case "hermes":
        return {
          wormLayer: makeHermesWormLayer(wormDbPath),
          adapterLayer: makeHermesAdapterLayer(),
        };
      case "goose":
        return {
          wormLayer: makeGooseWormLayer(wormDbPath),
          adapterLayer: makeGooseAdapterLayer(),
        };
      case "openhands":
        return {
          wormLayer: makeOpenHandsWormLayer(wormDbPath),
          adapterLayer: makeOpenHandsAdapterLayer(),
        };
      case "pi":
        return {
          wormLayer: makePiWormLayer(wormDbPath),
          adapterLayer: makePiAdapterLayer(),
        };
      case "deepseek":
        return {
          wormLayer: makeDeepSeekWormLayer(wormDbPath),
          adapterLayer: makeDeepSeekAdapterLayer(),
        };
      default: {
        const _exhaustive: never = agentName;
        throw new Error(`Unknown agent: ${String(_exhaustive)}`);
      }
    }
  });
