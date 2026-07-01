import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { z } from "zod";
import { idpPipelineRunnerEnabled } from "./env.js";
import { runIdpPipeline, type RunIdpPipelineInput } from "./runner.js";
import { getDocumentsPluginDeps } from "../plugin/deps.js";
import type { IdpPipelineStage } from "./idp-pipeline.js";

const stageEnum = z.enum([
  "nextcloud",
  "tika",
  "gotenberg",
  "stirling",
  "paperless",
  "onyx",
  "coneshare",
]);

export const runIdpPipelineToolSchema = {
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "Default true: plan hops and resolve args without calling execute. Set false to run the pipeline."
    ),
  correlation_id: z
    .string()
    .optional()
    .describe("Correlation id for audit, dashboard, and optional NATS hooks."),
  document_path: z
    .string()
    .optional()
    .describe(
      "Nextcloud relative path for inbox file (substitutes ${document_path} / ${source_path} in templates)."
    ),
  processed_path: z
    .string()
    .optional()
    .describe("Output path for processed upload step (${processed_path} template)."),
  step_args: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .describe("Per operationId execute args (merged over step argsTemplate)."),
  skip_stages: z
    .array(stageEnum)
    .optional()
    .describe(
      "Omit hops for these pipeline stages (e.g. skip paperless when using archive layer)."
    ),
  stop_on_error: z
    .boolean()
    .optional()
    .describe("Default true: halt remaining hops after first failure."),
  max_retries: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe("Per-hop retries on execute failure (default from CLAWQL_IDP_PIPELINE_MAX_RETRIES)."),
  from_step: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Inclusive start index into DEFAULT_IDP_PIPELINE (0-based)."),
  to_step: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Inclusive end index into DEFAULT_IDP_PIPELINE (0-based)."),
};

export async function handleRunIdpPipelineToolInput(
  params: RunIdpPipelineInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("run_idp_pipeline", {
    dryRun: params.dry_run !== false,
    correlationIdLen: params.correlation_id?.length,
    documentPathLen: params.document_path?.length,
    skipStages: params.skip_stages?.length,
  });

  if (!idpPipelineRunnerEnabled()) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            error:
              "IDP pipeline runner is disabled. Set CLAWQL_ENABLE_IDP_PIPELINE=1 (requires CLAWQL_ENABLE_DOCUMENTS=1).",
          }),
        },
      ],
    };
  }

  const deps = getDocumentsPluginDeps();
  const result = await runIdpPipeline(params, {
    execute: (p) => deps.execute(p),
    onHop: deps.onPipelineHop,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
