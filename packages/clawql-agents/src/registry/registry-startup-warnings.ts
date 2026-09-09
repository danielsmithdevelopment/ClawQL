/**
 * Loud config warnings for Gap B agent instance registry enrollment.
 * Pattern matches clawql-auth MCP OAuth startup warnings (`Effect.sync` + console.warn).
 */

import { Effect } from "effect";
import type { AgentName, ClawQLAgentConfig } from "../shared/types.js";
import { isPersistentAgentType } from "./types.js";

export const AGENT_REGISTRY_MISSING_PARENT_GATEWAY_WARNING =
  "[clawql-agents] CONFIG WARNING: persistent agent has orgId set but parentGatewayId is unset — " +
  "the instance cannot register in the org agent registry and will stay invisible in topology. " +
  "Set config.parentGatewayId or CLAWQL_PARENT_GATEWAY_ID to a GatewayRecord.gatewayId from Gap A. " +
  "Leaving both orgId and parentGatewayId unset is fine (registry opt-out).";

const warnedKeys = new Set<string>();

function resolveOrgId(config: ClawQLAgentConfig): string {
  return config.orgId?.trim() || process.env.CLAWQL_ORG_ID?.trim() || "";
}

function resolveParentGatewayId(config: ClawQLAgentConfig): string {
  return config.parentGatewayId?.trim() || process.env.CLAWQL_PARENT_GATEWAY_ID?.trim() || "";
}

/**
 * Warn when a persistent adapter is configured for an org but has no parent gateway.
 * Topology requires every AgentNode under a GatewayNode — missing parent is a config gap,
 * not a supported “orphan agent” state.
 */
export const warnIfAgentRegistryMissingParentGateway = (
  config: ClawQLAgentConfig,
  agentName: AgentName,
  options: { readonly agentId?: string; readonly onceKey?: string } = {}
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (!isPersistentAgentType(agentName)) return;
    const orgId = resolveOrgId(config);
    if (!orgId) return;
    if (resolveParentGatewayId(config)) return;

    const key =
      options.onceKey?.trim() ||
      `${orgId}:${agentName}:${options.agentId?.trim() || config.agentInstanceId?.trim() || "unknown"}`;
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);
    console.warn(
      `${AGENT_REGISTRY_MISSING_PARENT_GATEWAY_WARNING} (agent=${agentName} orgId=${orgId})`
    );
  });

/** Test helper — clear once-keys between cases. */
export const resetAgentRegistryParentWarningsForTests = (): void => {
  warnedKeys.clear();
};
