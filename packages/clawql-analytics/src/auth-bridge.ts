/**
 * ATR scope checks for analytics governance (config, raw data, export).
 * Pageview capture does not require scopes — it is not a governed read/write of config.
 */

import type { AtrClaims } from "clawql-auth";
import { Effect } from "effect";

import { AnalyticsAuthError } from "./errors.js";

export const ANALYTICS_SCOPES = {
  "analytics:view_aggregate": "View dashboards and aggregate metrics only",
  "analytics:view_raw": "View underlying, non-aggregated event data",
  "analytics:configure": "Add, remove, or reconfigure providers",
  "analytics:export": "Export raw data out of the provider",
} as const;

export type AnalyticsScope = keyof typeof ANALYTICS_SCOPES;

/** Session context with ATR scopes from {@link AtrClaims}. */
export type AnalyticsSessionContext = Pick<AtrClaims, "sub" | "scope">;

export const requireAnalyticsScopeEffect = (
  session: AnalyticsSessionContext,
  scope: AnalyticsScope
): Effect.Effect<void, AnalyticsAuthError> =>
  session.scope.includes(scope)
    ? Effect.void
    : Effect.fail(
        new AnalyticsAuthError({
          scope,
          reason: `Session lacks required scope: ${scope}`,
        })
      );

export const hasAnalyticsScope = (
  session: AnalyticsSessionContext,
  scope: AnalyticsScope
): boolean => session.scope.includes(scope);
