import { Effect } from "effect";

export type InitNetworkingOptions = {
  readonly controlPlaneHost?: string;
  readonly nodeId?: string;
  readonly offerSelfHostedDerp?: boolean;
};

export type InitNetworkingResult = {
  readonly transportDefault: "headscale-mesh";
  readonly tailcatScopeRequired: "network:tailcat_ephemeral";
};

/**
 * `clawql init --networking` bootstrap (spec §8 — partial scaffold).
 * Returns safe defaults; Headscale/DERP automation calls land in a follow-up.
 */
export const initNetworking = (
  _options: InitNetworkingOptions = {}
): Effect.Effect<InitNetworkingResult, never> =>
  Effect.succeed({
    transportDefault: "headscale-mesh" as const,
    tailcatScopeRequired: "network:tailcat_ephemeral" as const,
  });
