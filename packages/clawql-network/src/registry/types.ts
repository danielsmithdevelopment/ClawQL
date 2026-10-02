/**
 * Org-scoped gateway fleet registry (Gap A).
 * Spec: docs/specs/network/gateway-agent-registries-v0.1.md
 */

export type GatewayKind = "regional" | "edge";
export type GatewayStatus = "healthy" | "degraded" | "offline";

export type GatewayRecord = {
  readonly gatewayId: string;
  readonly orgId: string;
  readonly kind: GatewayKind;
  /** Headscale / Tailscale mesh identity string (unchanged semantics). */
  readonly meshIdentity: string;
  /** Edge only. */
  readonly ownerDeveloper?: string;
  readonly lastSeen: string;
  readonly status: GatewayStatus;
};

export type RegisterGatewayInput = Omit<GatewayRecord, "lastSeen" | "status">;

/** Default heartbeat interval (ms) — reuse for status derivation windows. */
export const GATEWAY_HEARTBEAT_INTERVAL_MS = 30_000;

/** Missed intervals before degraded / offline. */
export const GATEWAY_DEGRADED_AFTER_MISSED = 1;
export const GATEWAY_OFFLINE_AFTER_MISSED = 2;
