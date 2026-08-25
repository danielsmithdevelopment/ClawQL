import { Effect, Layer } from "effect";
import { makeClineAdapterLayer, makeClineWormLayer } from "./adapters/cline/index.js";
import { makeHermesAdapterLayer, makeHermesWormLayer } from "./adapters/hermes/index.js";
import { makeOpenClawAdapterLayer, makeOpenClawWormLayer } from "./adapters/openclaw/index.js";
import type { AgentName } from "./shared/types.js";
import { AgentAdapter } from "./shared/types.js";

export type AdapterBundle = {
  readonly wormLayer: ReturnType<typeof makeClineWormLayer>;
  readonly adapterLayer: Layer.Layer<AgentAdapter>;
};

/**
 * Resolve adapter + local WORM layers for a catalog agent.
 * Phase 1–2: cline | openclaw | hermes. Later phases raise.
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
      default:
        throw new Error(
          `Adapter for ${agentName} is not implemented yet (Phase 3–4). Use cline | openclaw | hermes.`
        );
    }
  });
