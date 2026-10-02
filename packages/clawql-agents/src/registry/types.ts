/**
 * Persistent agent instance registry (Gap B).
 * Spec: docs/specs/network/gateway-agent-registries-v0.1.md
 */

export type PersistentAgentType = "hermes" | "cline" | "openclaw" | "pi";

export type AgentInstanceStatus = "active" | "idle" | "offline";

export type AgentInstanceRecord = {
  readonly agentId: string;
  readonly agentType: PersistentAgentType;
  readonly parentGatewayId: string;
  readonly orgId: string;
  readonly lastActive: string;
  readonly status: AgentInstanceStatus;
  /**
   * Latest inference correlation / session id for dashboard topology → mcp-ui
   * `/trace/agent/…` deep-links (#1082). When unset, topology falls back to `agentId`
   * (live flamegraph if the store keyed that id; otherwise explicit not-found).
   */
  readonly lastCorrelationId?: string;
};

export type RegisterAgentInstanceInput = Omit<AgentInstanceRecord, "lastActive" | "status">;

export type AgentHeartbeatOptions = {
  readonly lastCorrelationId?: string;
};

export const AGENT_HEARTBEAT_INTERVAL_MS = 30_000;
export const AGENT_IDLE_AFTER_MISSED = 1;
export const AGENT_OFFLINE_AFTER_MISSED = 2;

export const PERSISTENT_AGENT_TYPES: readonly PersistentAgentType[] = [
  "hermes",
  "cline",
  "openclaw",
  "pi",
] as const;

export const isPersistentAgentType = (name: string): name is PersistentAgentType =>
  (PERSISTENT_AGENT_TYPES as readonly string[]).includes(name);
