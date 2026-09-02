import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { Effect } from "effect";

import type { MeshIdentity } from "./headscale/node-registration.js";
import { TAILCAT_EPHEMERAL_ATR_SCOPE } from "./enforcement/constants.js";
import { NETWORK_STATE_VERSION, networkRoot, networkStatePath } from "./internal/paths.js";

export type NetworkState = {
  readonly version: typeof NETWORK_STATE_VERSION;
  readonly transportDefault: "headscale-mesh";
  readonly tailcatScopeRequired: typeof TAILCAT_EPHEMERAL_ATR_SCOPE;
  readonly controlPlaneHost: string;
  readonly loginServerUrl?: string;
  readonly namespace: string;
  readonly meshIdentity?: MeshIdentity;
  readonly derpRelay?: {
    readonly region: string;
    readonly endpoint?: string;
    readonly pid?: number;
  };
  readonly initializedAt: string;
};

export const defaultNetworkState = (
  controlPlaneHost: string,
  namespace = "clawql"
): Omit<NetworkState, "initializedAt"> => ({
  version: NETWORK_STATE_VERSION,
  transportDefault: "headscale-mesh",
  tailcatScopeRequired: TAILCAT_EPHEMERAL_ATR_SCOPE,
  controlPlaneHost,
  namespace,
});

export const loadNetworkState = (home?: string): Effect.Effect<NetworkState | null, never> =>
  Effect.promise(async () => {
    try {
      const path = networkStatePath(home);
      if (!existsSync(path)) return null;
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as NetworkState;
    } catch {
      return null;
    }
  });

export const saveNetworkState = (state: NetworkState, home?: string): Effect.Effect<void, never> =>
  Effect.promise(async () => {
    const root = networkRoot(home);
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(networkStatePath(home), `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  });
