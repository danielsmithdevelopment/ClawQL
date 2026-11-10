export type ConnectionTargetType =
  | "known-fleet-node"
  | "customer-tailnet-service"
  | "ephemeral-peer"
  | "unknown";

export type NetworkTransport = "headscale-mesh" | "customer-tailnet" | "tailcat";

export type ConnectionRequest = {
  readonly targetType: ConnectionTargetType;
  /** Informational only — never selects a transport (v0.2). */
  readonly expectedDurationMs?: number;
};

/**
 * Pick Headscale mesh vs customer tailnet vs Tailcat per clawql-network spec §7 (v0.2).
 * Only an explicit `ephemeral-peer` selects Tailcat; duration never does; ambiguity → mesh.
 * Pure — safe to call from Effect.sync at boundaries.
 */
export function selectTransport(req: ConnectionRequest): NetworkTransport {
  switch (req.targetType) {
    case "known-fleet-node":
      return "headscale-mesh";
    case "customer-tailnet-service":
      return "customer-tailnet";
    case "ephemeral-peer":
      return "tailcat";
    default:
      return "headscale-mesh";
  }
}
