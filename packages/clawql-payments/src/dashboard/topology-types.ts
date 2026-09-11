/**
 * Customer dashboard topology tree — one GatewayNode shape, one AgentNode shape.
 * Spec: docs/specs/billing/customer-dashboard-full-scope-v0.1.md
 */

export type GatewayKind = "regional" | "edge";
export type GatewayStatus = "healthy" | "degraded" | "offline";
export type AgentKind = "persistent" | "cell";
export type PersistentAgentType = "hermes" | "cline" | "openclaw" | "pi";
export type CellStatus = "resident" | "hibernating";

export type AgentNode = {
  readonly agentId: string;
  readonly kind: AgentKind;
  readonly agentType?: PersistentAgentType;
  readonly cellStatus?: CellStatus;
  readonly parentGatewayId: string;
  readonly lastActive: string;
  /** Deep-link into Traces / mcp-ui (must resolve — prefer compare?focus=). */
  readonly traceLink: string;
  /** Derived UI status for the tree status dot. */
  readonly status: GatewayStatus;
};

export type GatewayNode = {
  readonly gatewayId: string;
  readonly kind: GatewayKind;
  readonly meshIdentity: string;
  readonly ownerDeveloper?: string;
  readonly lastSeen: string;
  readonly status: GatewayStatus;
  readonly children: readonly AgentNode[];
};

export type TopologyTree = {
  readonly gateways: readonly GatewayNode[];
  /** Which readers contributed (for operator debugging; not secrets). */
  readonly sources: readonly string[];
  readonly empty: boolean;
};

/** Optional on-disk / env snapshot override for tests and air-gapped demos. */
export type TopologySnapshotFile = {
  readonly gateways: readonly GatewayNode[];
  readonly sources?: readonly string[];
};
