/**
 * Interval heartbeat helper for a registered gateway.
 */

import { Effect } from "effect";
import { GatewayRegistryService, gatewayRegistryLiveLayer } from "./gateway-registry-service.js";
import { GATEWAY_HEARTBEAT_INTERVAL_MS } from "./types.js";

export type GatewayHeartbeatHandle = {
  readonly stop: () => void;
};

/**
 * Start periodic heartbeats. Returns a handle to clear the interval.
 */
export const startGatewayHeartbeatLoop = (
  gatewayId: string,
  orgId: string,
  options: { readonly intervalMs?: number; readonly home?: string } = {}
): GatewayHeartbeatHandle => {
  const intervalMs = options.intervalMs ?? GATEWAY_HEARTBEAT_INTERVAL_MS;
  const tick = () => {
    void Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* GatewayRegistryService;
        return yield* reg.heartbeat(gatewayId, orgId);
      }).pipe(Effect.provide(gatewayRegistryLiveLayer(options.home)))
    );
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return { stop: () => clearInterval(id) };
};
