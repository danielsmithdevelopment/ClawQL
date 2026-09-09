/**
 * Optional register/heartbeat hooks used from AgentAdapter start/health.
 * Uses live file registry when orgId + parentGatewayId are configured.
 */

import { Effect } from "effect";
import type { AgentName, ClawQLAgentConfig } from "../shared/types.js";
import {
  AgentInstanceRegistryService,
  agentInstanceRegistryLiveLayer,
} from "./agent-instance-registry-service.js";
import { isPersistentAgentType, type PersistentAgentType } from "./types.js";

export type RegistrySessionHints = {
  readonly agentId: string;
  readonly agentName: AgentName;
};

const resolveOrgId = (config: ClawQLAgentConfig): string =>
  config.orgId?.trim() || process.env.CLAWQL_ORG_ID?.trim() || "";

const resolveParentGatewayId = (config: ClawQLAgentConfig): string =>
  config.parentGatewayId?.trim() || process.env.CLAWQL_PARENT_GATEWAY_ID?.trim() || "";

const resolveHome = (config: ClawQLAgentConfig): string | undefined =>
  config.registryHome?.trim() || undefined;

/**
 * After start(): register persistent agent instance when org + gateway configured.
 */
export const registerAgentInstanceOnStart = (
  config: ClawQLAgentConfig,
  hints: RegistrySessionHints
): Effect.Effect<void> => {
  if (!isPersistentAgentType(hints.agentName)) return Effect.void;
  const orgId = resolveOrgId(config);
  const parentGatewayId = resolveParentGatewayId(config);
  if (!orgId || !parentGatewayId) return Effect.void;

  const agentId =
    config.agentInstanceId?.trim() ||
    hints.agentId ||
    `${hints.agentName}-${Date.now().toString(36)}`;

  return Effect.gen(function* () {
    const reg = yield* AgentInstanceRegistryService;
    yield* reg.registerAgentInstance({
      agentId,
      agentType: hints.agentName as PersistentAgentType,
      parentGatewayId,
      orgId,
    });
  }).pipe(
    Effect.provide(agentInstanceRegistryLiveLayer(resolveHome(config))),
    Effect.catchAll(() => Effect.void),
    Effect.asVoid
  );
};

/**
 * From health(): heartbeat when registry + identity configured.
 *
 * Reconnect / backfill: if the instance was never registered (process started
 * before Gap B, or start() ran without org/gateway), and `parentGatewayId` is
 * now available, upsert via `registerAgentInstance` so topology sees it without
 * requiring a full adapter restart.
 */
export const heartbeatAgentInstanceOnHealth = (
  config: ClawQLAgentConfig | null,
  hints: { readonly agentId?: string; readonly agentName: AgentName }
): Effect.Effect<void> => {
  if (!config || !isPersistentAgentType(hints.agentName)) return Effect.void;
  const orgId = resolveOrgId(config);
  if (!orgId) return Effect.void;
  const agentId = config.agentInstanceId?.trim() || hints.agentId || "";
  if (!agentId) return Effect.void;
  const parentGatewayId = resolveParentGatewayId(config);

  return Effect.gen(function* () {
    const reg = yield* AgentInstanceRegistryService;
    const beat = yield* reg.heartbeat(agentId, orgId);
    if (beat) return;
    // Unknown to registry — reconnect only when we can form a full record.
    if (!parentGatewayId) return;
    yield* reg.registerAgentInstance({
      agentId,
      agentType: hints.agentName as PersistentAgentType,
      parentGatewayId,
      orgId,
    });
  }).pipe(
    Effect.provide(agentInstanceRegistryLiveLayer(resolveHome(config))),
    Effect.catchAll(() => Effect.void),
    Effect.asVoid
  );
};
