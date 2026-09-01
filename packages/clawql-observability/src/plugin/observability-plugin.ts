import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";

import { applyAlloyConfigEffect } from "../alloy/apply.js";
import { resolveAlloyReloadFromEnvEffect } from "../alloy/reload.js";
import { snapshotRegistriesForAlloyEffect } from "../alloy/from-registry.js";
import { ObservabilityError } from "../errors.js";
import { ObservabilityAlertingService } from "../alerting/service.js";
import { ObservabilityHealthService } from "../health/scheduler.js";
import { readObservabilityHostConfigEffect } from "../host/config.js";
import { runObservabilityHostEffect } from "../host/runtime.js";
import { resolveObservabilitySessionForRuntimeEffect } from "../host/session-context.js";
import { ObservabilityQueryService } from "../query/federation.js";
import type {
  LogQueryRequest,
  MetricQueryRequest,
  ProfileQueryRequest,
  TraceQueryRequest,
} from "../query/types.js";
import { ObservabilityAuthError } from "../scopes.js";

export const OBSERVABILITY_PLUGIN_ID = "clawql-observability";

const timeRangeSchema = {
  startMs: z.number().describe("Range start (Unix ms)."),
  endMs: z.number().describe("Range end (Unix ms)."),
};

const selectionSchema = {
  mode: z.enum(["one", "all", "primary"]).optional().describe("Provider selection mode."),
  providerId: z.string().optional().describe("Required when mode is one."),
  primaryProviderId: z.string().optional().describe("Preferred provider when mode is primary."),
};

export const observabilityQueryLogsSchema = {
  logql: z.string().min(1).describe("LogQL query string."),
  timeRange: z.object(timeRangeSchema),
  limit: z.number().int().positive().optional(),
  selection: z.object(selectionSchema).optional(),
};

export const observabilityQueryMetricsSchema = {
  promql: z.string().min(1).describe("PromQL query string."),
  timeRange: z.object(timeRangeSchema),
  stepSeconds: z.number().int().positive().optional(),
  selection: z.object(selectionSchema).optional(),
};

export const observabilityQueryTracesSchema = {
  traceql: z.string().min(1).describe("TraceQL query string."),
  timeRange: z.object(timeRangeSchema),
  limit: z.number().int().positive().optional(),
  selection: z.object(selectionSchema).optional(),
};

export const observabilityQueryProfilesSchema = {
  query: z.string().min(1).describe("Pyroscope profile query."),
  timeRange: z.object(timeRangeSchema),
  selection: z.object(selectionSchema).optional(),
};

export const observabilityApplyAlloySchema = {
  outputPath: z
    .string()
    .optional()
    .describe("Destination River file path (defaults to CLAWQL_OBSERVABILITY_ALLOY_OUTPUT_PATH)."),
};

type McpTextResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function textToolResult(payload: unknown): Promise<McpTextResult> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

async function errorToolResult(err: unknown): Promise<McpTextResult> {
  if (err instanceof ObservabilityAuthError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "forbidden", scope: err.scope, reason: err.reason }),
        },
      ],
    };
  }
  if (err instanceof ObservabilityError) {
    return {
      isError: true,
      content: [
        { type: "text", text: JSON.stringify({ error: "observability_error", reason: err.reason }) },
      ],
    };
  }
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: "internal_error",
          message: err instanceof Error ? err.message : String(err),
        }),
      },
    ],
  };
}

export type CreateObservabilityPluginOptions = {
  readonly env?: NodeJS.ProcessEnv;
};

function logObservabilityTool(name: string, meta: Record<string, unknown>): void {
  if (process.env.CLAWQL_MCP_TOOL_SHAPE_LOG === "1") {
    console.debug(`[clawql-observability] ${name}`, meta);
  }
}

export function createObservabilityPlugin(
  options: CreateObservabilityPluginOptions = {}
): Plugin {
  const env = options.env ?? process.env;

  return {
    id: OBSERVABILITY_PLUGIN_ID,
    version: "0.6.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "observability_query_logs",
          schema: observabilityQueryLogsSchema,
          handler: async (args) => {
            try {
              logObservabilityTool("observability_query_logs", {
                logqlLen: String((args as LogQueryRequest).logql ?? "").length,
              });
              const session = await Effect.runPromise(
                resolveObservabilitySessionForRuntimeEffect(env)
              );
              const result = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const query = yield* ObservabilityQueryService;
                  return yield* query.queryLogs(session, args as LogQueryRequest);
                }),
                env
              );
              return textToolResult(result);
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "observability_query_metrics",
          schema: observabilityQueryMetricsSchema,
          handler: async (args) => {
            try {
              logObservabilityTool("observability_query_metrics", {
                promqlLen: String((args as MetricQueryRequest).promql ?? "").length,
              });
              const session = await Effect.runPromise(
                resolveObservabilitySessionForRuntimeEffect(env)
              );
              const result = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const query = yield* ObservabilityQueryService;
                  return yield* query.queryMetrics(session, args as MetricQueryRequest);
                }),
                env
              );
              return textToolResult(result);
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "observability_query_traces",
          schema: observabilityQueryTracesSchema,
          handler: async (args) => {
            try {
              logObservabilityTool("observability_query_traces", {
                traceqlLen: String((args as TraceQueryRequest).traceql ?? "").length,
              });
              const session = await Effect.runPromise(
                resolveObservabilitySessionForRuntimeEffect(env)
              );
              const result = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const query = yield* ObservabilityQueryService;
                  return yield* query.queryTraces(session, args as TraceQueryRequest);
                }),
                env
              );
              return textToolResult(result);
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "observability_query_profiles",
          schema: observabilityQueryProfilesSchema,
          handler: async (args) => {
            try {
              logObservabilityTool("observability_query_profiles", {
                queryLen: String((args as ProfileQueryRequest).query ?? "").length,
              });
              const session = await Effect.runPromise(
                resolveObservabilitySessionForRuntimeEffect(env)
              );
              const result = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const query = yield* ObservabilityQueryService;
                  return yield* query.queryProfiles(session, args as ProfileQueryRequest);
                }),
                env
              );
              return textToolResult(result);
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "observability_health",
          schema: {},
          handler: async () => {
            try {
              logObservabilityTool("observability_health", {});
              const snapshot = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const health = yield* ObservabilityHealthService;
                  return yield* health.runOnce();
                }),
                env
              );
              return textToolResult(snapshot);
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "observability_alerts",
          schema: {},
          handler: async () => {
            try {
              logObservabilityTool("observability_alerts", {});
              const events = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const alerting = yield* ObservabilityAlertingService;
                  return yield* alerting.evaluateHealth();
                }),
                env
              );
              return textToolResult({ events });
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });

        yield* api.registerMcpTool({
          name: "observability_apply_alloy_config",
          schema: observabilityApplyAlloySchema,
          handler: async (args) => {
            try {
              logObservabilityTool("observability_apply_alloy_config", args as Record<string, unknown>);
              const session = await Effect.runPromise(
                resolveObservabilitySessionForRuntimeEffect(env)
              );
              const config = await Effect.runPromise(readObservabilityHostConfigEffect(env));
              const outputPath =
                (args as { outputPath?: string }).outputPath?.trim() || config.alloyOutputPath;
              const result = await runObservabilityHostEffect(
                Effect.gen(function* () {
                  const generation = yield* snapshotRegistriesForAlloyEffect();
                  const { reload } = yield* resolveAlloyReloadFromEnvEffect(env);
                  return yield* applyAlloyConfigEffect({
                    session,
                    actorId: session.sub,
                    generation,
                    outputPath,
                    reload,
                  });
                }),
                env
              );
              return textToolResult(result);
            } catch (err) {
              return errorToolResult(err);
            }
          },
        });
      }),
  };
}
