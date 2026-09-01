import { hostname } from "node:os";

import { Effect } from "effect";

import { bootstrapHeadscale } from "../headscale/bootstrap.js";
import { joinMesh } from "../headscale/node-registration.js";
import { defaultNetworkState, loadNetworkState, saveNetworkState } from "../network-state.js";
import { startSelfHostedDerper } from "../tailcat/derp-relay/self-hosted-derper.js";
import type { NetworkCommandError } from "../errors.js";

export type InitNetworkingOptions = {
  readonly home?: string;
  readonly controlPlaneHost?: string;
  readonly nodeId?: string;
  readonly offerSelfHostedDerp?: boolean;
  readonly derpRegion?: string;
  readonly loginServerUrl?: string;
};

export type InitNetworkingResult = {
  readonly transportDefault: "headscale-mesh";
  readonly tailcatScopeRequired: "network:tailcat_ephemeral";
  readonly configPath: string;
  readonly headscaleBootstrapped: boolean;
  readonly nodeRegistered: boolean;
  readonly meshIdentity?: {
    readonly nodeId: string;
    readonly meshAddress: string;
    readonly namespace: string;
  };
  readonly derpRelay?: {
    readonly region: string;
    readonly endpoint: string;
    readonly started: boolean;
  };
};

/**
 * `clawql init --networking` bootstrap (spec §8).
 */
export const initNetworking = (
  options: InitNetworkingOptions = {}
): Effect.Effect<InitNetworkingResult, NetworkCommandError> =>
  Effect.gen(function* () {
    const home = options.home;
    const existing = yield* loadNetworkState(home);
    const controlPlaneHost = options.controlPlaneHost ?? existing?.controlPlaneHost ?? "localhost";
    const nodeId = options.nodeId ?? hostname();
    const namespace = existing?.namespace ?? "clawql";

    const bootstrap = yield* bootstrapHeadscale({
      controlPlaneHost,
      namespace,
      loginServerUrl: options.loginServerUrl ?? existing?.loginServerUrl,
    });

    const meshIdentity = yield* joinMesh(nodeId, {
      namespace,
      loginServerUrl: bootstrap.loginServerUrl,
    });

    let derpRelay: InitNetworkingResult["derpRelay"];
    if (options.offerSelfHostedDerp) {
      const region = options.derpRegion ?? "local";
      const started = yield* startSelfHostedDerper(region).pipe(
        Effect.map((handle) => ({
          region: handle.region,
          endpoint: handle.endpoint,
          started: true as const,
        })),
        Effect.catchAll(() =>
          Effect.succeed({
            region,
            endpoint: "",
            started: false as const,
          })
        )
      );
      derpRelay = started;
    }

    const state = {
      ...defaultNetworkState(controlPlaneHost, namespace),
      controlPlaneHost,
      loginServerUrl: bootstrap.loginServerUrl,
      meshIdentity,
      derpRelay: derpRelay?.started
        ? { region: derpRelay.region, endpoint: derpRelay.endpoint }
        : undefined,
      initializedAt: new Date().toISOString(),
    };
    yield* saveNetworkState(state, home);

    return {
      transportDefault: "headscale-mesh",
      tailcatScopeRequired: "network:tailcat_ephemeral",
      configPath: bootstrap.configPath,
      headscaleBootstrapped: bootstrap.bootstrapped,
      nodeRegistered: Boolean(meshIdentity.meshAddress),
      meshIdentity,
      derpRelay,
    };
  });
