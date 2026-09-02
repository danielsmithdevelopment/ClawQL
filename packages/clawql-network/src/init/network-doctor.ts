import { Effect } from "effect";

import { commandAvailable } from "../internal/subprocess.js";
import { loadNetworkState } from "../network-state.js";
import { resolveTailcatBinary } from "../tailcat/binary.js";

export type NetworkDoctorCheck = {
  readonly level: "ok" | "warn" | "fail";
  readonly message: string;
  readonly detail?: string;
};

export const networkDoctorCheck = (home?: string): Effect.Effect<NetworkDoctorCheck, never> =>
  Effect.gen(function* () {
    const state = yield* loadNetworkState(home);
    if (!state) {
      return {
        level: "warn",
        message: "ClawQL networking: not initialized",
        detail: "Run: clawql init --networking",
      };
    }

    const tailscale = yield* commandAvailable("tailscale");
    const headscale = yield* commandAvailable("headscale");
    const tailcat = yield* resolveTailcatBinary().pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    );

    const parts = [
      `transport=${state.transportDefault}`,
      state.meshIdentity ? `mesh=${state.meshIdentity.meshAddress}` : "mesh=unregistered",
      `tailscale=${tailscale ? "yes" : "no"}`,
      `headscale=${headscale ? "yes" : "no"}`,
      `tailcat=${tailcat ? "yes" : "no"}`,
    ];

    return {
      level: tailcat ? "ok" : "warn",
      message: "ClawQL networking initialized",
      detail: parts.join(", "),
    };
  });

export const networkStatusLines = (home?: string): Effect.Effect<string[], never> =>
  Effect.gen(function* () {
    const state = yield* loadNetworkState(home);
    if (!state) return ["Networking not configured — run: clawql init --networking"];
    const lines = [
      `Transport default: ${state.transportDefault}`,
      `Tailcat ATR scope: ${state.tailcatScopeRequired}`,
      `Control plane: ${state.controlPlaneHost}`,
    ];
    if (state.loginServerUrl) lines.push(`Login server: ${state.loginServerUrl}`);
    if (state.meshIdentity) {
      lines.push(`Mesh node: ${state.meshIdentity.nodeId} (${state.meshIdentity.meshAddress})`);
    }
    if (state.derpRelay) {
      lines.push(
        `DERP relay: ${state.derpRelay.region} @ ${state.derpRelay.endpoint ?? "unknown"}`
      );
    }
    lines.push(`Initialized: ${state.initializedAt}`);
    return lines;
  });
