export type ConnectionTargetType = "known-fleet-node" | "ephemeral-peer" | "unknown";

export type NetworkTransport = "headscale-mesh" | "tailcat";

export type ConnectionRequest = {
  readonly targetType: ConnectionTargetType;
  readonly expectedDurationMs?: number;
};

/** Short-lived ephemeral links default to tailcat; ambiguity defaults to governed mesh. */
export const EPHEMERAL_DURATION_THRESHOLD_MS = 60_000 as const;

/**
 * Pick Headscale mesh vs Tailcat per clawql-network spec §6.
 * Pure — safe to call from Effect.sync at boundaries.
 */
export function selectTransport(req: ConnectionRequest): NetworkTransport {
  if (req.targetType === "known-fleet-node") {
    return "headscale-mesh";
  }

  if (
    req.targetType === "ephemeral-peer" ||
    (req.expectedDurationMs !== undefined &&
      req.expectedDurationMs < EPHEMERAL_DURATION_THRESHOLD_MS)
  ) {
    return "tailcat";
  }

  return "headscale-mesh";
}
