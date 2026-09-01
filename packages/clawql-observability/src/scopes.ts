import { Data, Effect } from "effect";

/** Typed failure when a session lacks a required observability scope. */
export class ObservabilityAuthError extends Data.TaggedError("ObservabilityAuthError")<{
  readonly scope: string;
  readonly reason: string;
}> {}

export const OBSERVABILITY_SCOPES = {
  "observability:configure": "Register, remove, or reconfigure observability providers",
  "observability:query_logs": "Federated LogQL / log read",
  "observability:query_metrics": "Federated PromQL / metric read",
  "observability:query_traces": "Federated trace search",
  "observability:query_profiles": "Federated profile read",
  "observability:export": "Export raw telemetry out of governed backends",
} as const;

export type ObservabilityScope = keyof typeof OBSERVABILITY_SCOPES;

export type ObservabilitySessionContext = {
  readonly sub: string;
  readonly scope: readonly string[];
};

export const hasObservabilityScope = (
  session: ObservabilitySessionContext,
  scope: ObservabilityScope
): boolean => session.scope.includes(scope);

export const requireObservabilityScopeEffect = (
  session: ObservabilitySessionContext,
  scope: ObservabilityScope
): Effect.Effect<void, ObservabilityAuthError> =>
  hasObservabilityScope(session, scope)
    ? Effect.void
    : Effect.fail(
        new ObservabilityAuthError({
          scope,
          reason: `session ${session.sub} lacks required scope ${scope}`,
        })
      );
