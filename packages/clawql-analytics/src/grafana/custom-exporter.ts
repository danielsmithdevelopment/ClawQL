import { Effect } from "effect";

import { AnalyticsError } from "../errors.js";
import type { AnalyticsProvider } from "../types.js";

/** Aggregate stats pulled from a provider API (Phase 4 — not full raw events). */
export type AggregateAnalyticsStats = {
  readonly pageviews: number;
  readonly uniqueSessions: number;
  readonly topPages?: ReadonlyArray<{ path: string; count: number }>;
  readonly topReferrers?: ReadonlyArray<{ referrer: string; count: number }>;
};

/** Provider-side API client for aggregate metrics (implemented per provider in Phase 4). */
export type ProviderAggregateApiClient = {
  readonly getAggregateStats: (input: {
    period: string;
  }) => Effect.Effect<AggregateAnalyticsStats, AnalyticsError>;
};

export type PrometheusMetrics = Record<string, number>;

/**
 * Exports aggregate metrics in Prometheus exposition format for Mimir/Grafana.
 * Phase 4 — requires provider-specific API clients for PostHog / Plausible / Umami.
 */
export const exportAggregateMetricsEffect = (
  provider: AnalyticsProvider,
  providerApi: ProviderAggregateApiClient,
  period = "1h"
): Effect.Effect<PrometheusMetrics, AnalyticsError> =>
  Effect.gen(function* () {
    const stats = yield* providerApi.getAggregateStats({ period });
    const metrics: PrometheusMetrics = {
      [`clawql_analytics_pageviews_total{provider="${provider.id}"}`]: stats.pageviews,
      [`clawql_analytics_unique_sessions{provider="${provider.id}"}`]: stats.uniqueSessions,
    };
    stats.topPages?.forEach((row, i) => {
      metrics[
        `clawql_analytics_top_page_count{provider="${provider.id}",rank="${i + 1}",path="${row.path}"}`
      ] = row.count;
    });
    stats.topReferrers?.forEach((row, i) => {
      metrics[
        `clawql_analytics_top_referrer_count{provider="${provider.id}",rank="${i + 1}",referrer="${row.referrer}"}`
      ] = row.count;
    });
    return metrics;
  });
