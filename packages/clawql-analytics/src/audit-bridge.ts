/**
 * Governance audit bridge — configuration and access events only.
 * Individual pageviews and custom capture events are intentionally NOT written to WORM.
 */

import { appendProcessWormEffect } from "clawql-audit";
import { Effect } from "effect";

export type AnalyticsWormEntryType =
  | "ANALYTICS_PROVIDER_ADDED"
  | "ANALYTICS_PROVIDER_REMOVED"
  | "ANALYTICS_PROVIDER_CONFIG_CHANGED"
  | "ANALYTICS_RAW_DATA_ACCESSED"
  | "ANALYTICS_EXPORT_REQUESTED"
  | "ANALYTICS_ACCESS_GRANTED"
  | "ANALYTICS_ACCESS_REVOKED";

export type AnalyticsGovernanceEvent = {
  readonly type: AnalyticsWormEntryType;
  readonly actorId: string;
  readonly timestamp: string;
  readonly providerId?: string;
  readonly change?: Record<string, unknown>;
  readonly targetSubjectId?: string;
  readonly scope?: string;
  readonly detail?: Record<string, unknown>;
};

const appendGovernanceEvent = (event: AnalyticsGovernanceEvent): Effect.Effect<void> =>
  appendProcessWormEffect({
    type: event.type,
    timestamp: event.timestamp,
    sessionId: event.actorId,
    metadata: {
      source: "analytics",
      providerId: event.providerId,
      change: event.change,
      targetSubjectId: event.targetSubjectId,
      scope: event.scope,
      detail: event.detail,
    },
  }).pipe(Effect.asVoid);

export const logProviderAddedEffect = (input: {
  actorId: string;
  providerId: string;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_PROVIDER_ADDED",
    actorId: input.actorId,
    providerId: input.providerId,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

export const logProviderRemovedEffect = (input: {
  actorId: string;
  providerId: string;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_PROVIDER_REMOVED",
    actorId: input.actorId,
    providerId: input.providerId,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

export const logProviderConfigChangeEffect = (input: {
  actorId: string;
  providerId: string;
  change: Record<string, unknown>;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_PROVIDER_CONFIG_CHANGED",
    actorId: input.actorId,
    providerId: input.providerId,
    change: input.change,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

export const logRawDataAccessedEffect = (input: {
  actorId: string;
  providerId: string;
  detail?: Record<string, unknown>;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_RAW_DATA_ACCESSED",
    actorId: input.actorId,
    providerId: input.providerId,
    detail: input.detail,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

export const logExportRequestedEffect = (input: {
  actorId: string;
  providerId: string;
  detail?: Record<string, unknown>;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_EXPORT_REQUESTED",
    actorId: input.actorId,
    providerId: input.providerId,
    detail: input.detail,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

export const logAccessGrantedEffect = (input: {
  actorId: string;
  targetSubjectId: string;
  scope: string;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_ACCESS_GRANTED",
    actorId: input.actorId,
    targetSubjectId: input.targetSubjectId,
    scope: input.scope,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

export const logAccessRevokedEffect = (input: {
  actorId: string;
  targetSubjectId: string;
  scope: string;
  timestamp?: string;
}): Effect.Effect<void> =>
  appendGovernanceEvent({
    type: "ANALYTICS_ACCESS_REVOKED",
    actorId: input.actorId,
    targetSubjectId: input.targetSubjectId,
    scope: input.scope,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
