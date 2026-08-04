import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import {
  runNotifySlack,
  SLACK_NOTIFY_OPERATION_ID,
  type NotifySlackInput,
} from "../notify/notify.js";
import {
  handleScheduleToolInput as runScheduleTool,
  registerScheduleWorkerShutdownHooks,
  scheduleToolSchema,
  startScheduleWorker,
  stopScheduleWorker,
} from "../schedule/schedule.js";
import {
  handleWorkflowToolInput as runWorkflowTool,
  workflowToolSchema,
} from "../workflow/workflow.js";
import { argocdToolSchema, handleArgocdToolInput as runArgocdTool } from "../argocd/argocd.js";
import { startNatsWorkflowWorker, stopNatsWorkflowWorker } from "../nats/worker.js";
import {
  handleHitlEnqueueLabelStudioToolInput,
  type HitlLabelStudioEnqueueParams,
} from "../hitl/label-studio.js";

export const AUTOMATION_PLUGIN_ID = "clawql-automation";

/**
 * Argo Workflows `workflow` MCP tool — template-ref submit only in v1.
 * Vault digest WorkflowTemplate: deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml
 */
export const notifyToolSchema = {
  channel: z
    .string()
    .min(1)
    .describe("Channel ID (C…), private group, or DM — same as Slack chat.postMessage `channel`."),
  text: z
    .string()
    .min(1)
    .describe("Message text. Include Onyx/Paperless links inline for workflow summaries."),
  thread_ts: z.string().optional().describe("Optional parent message `ts` to post in a thread."),
  blocks: z
    .string()
    .optional()
    .describe("Optional JSON string of Block Kit blocks (Slack form field `blocks`)."),
  attachments: z.string().optional().describe("Optional JSON string of legacy attachments."),
  username: z.string().optional().describe("Override bot display name (requires as_user false)."),
  icon_emoji: z.string().optional().describe("Override bot icon emoji."),
  icon_url: z.string().optional().describe("Override bot icon image URL."),
  mrkdwn: z.boolean().optional().describe("Pass false to disable Slack mrkdwn parsing."),
  unfurl_links: z.boolean().optional(),
  unfurl_media: z.boolean().optional(),
  reply_broadcast: z.boolean().optional(),
  parse: z.string().optional().describe("Slack parse mode: full | none | …"),
  link_names: z.boolean().optional(),
  as_user: z.boolean().optional(),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Optional top-level response keys to return (same as execute `fields`). " +
        "Omit for defaults: ok, channel, ts, message."
    ),
};

export const hitlLabelStudioToolSchema = {
  project_id: z
    .number()
    .int()
    .min(1)
    .describe("Label Studio project id (integer pk in /api/projects/{id}/import)."),
  tasks: z
    .array(
      z.object({
        data: z
          .record(z.string(), z.unknown())
          .describe("Task fields shown to annotators (maps to Label Studio task.data)."),
        meta: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional extra JSON merged into task.data.meta."),
        predictions: z
          .array(
            z.object({
              result: z
                .array(z.unknown())
                .max(200)
                .describe(
                  "Label Studio prediction result regions/choices (from_name/to_name/type/value)."
                ),
              model_version: z
                .string()
                .max(256)
                .optional()
                .describe("Optional model version label shown in Label Studio."),
              score: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Optional prediction score in [0, 1]."),
            })
          )
          .max(20)
          .optional()
          .describe(
            "Optional Label Studio pre-annotations (predictions) for this task ([#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247))."
          ),
      })
    )
    .min(1)
    .max(100)
    .describe("Tasks to import in one batch."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional model confidence stored under data.clawql_hitl.confidence."),
  correlation_id: z
    .string()
    .max(512)
    .optional()
    .describe("Optional id for OpenClaw / logs / webhook correlation."),
  seed_id: z.string().max(256).optional().describe("Optional Ouroboros or workflow seed id."),
  workflow_ref: z
    .object({
      namespace: z.string().min(1).max(63),
      name: z.string().min(1).max(253),
      node_field_selector: z.string().max(512).optional(),
    })
    .optional()
    .describe(
      "Optional Argo Workflow to resume on Label Studio webhook when CLAWQL_HITL_WEBHOOK_RESUME_WORKFLOW=1."
    ),
  provenance: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional provenance object stored under data.clawql_hitl.provenance."),
};

export async function handleScheduleToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const p = params as {
    operation?: string;
    job_id?: string;
    include_runs?: boolean;
    dry_run?: boolean;
  };
  logMcpToolShape("schedule", {
    operation: p.operation,
    jobIdLen: p.job_id?.length,
    includeRuns: p.include_runs,
    dryRun: p.dry_run,
  });
  return runScheduleTool(params);
}

export async function handleNotifyToolInput(
  params: NotifySlackInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  return runNotifySlack(params);
}

export async function handleWorkflowToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const p = params as { operation?: string; namespace?: string; name?: string };
  logMcpToolShape("workflow", {
    operation: p.operation,
    namespaceLen: p.namespace?.length,
    nameLen: p.name?.length,
  });
  return runWorkflowTool(params);
}

export async function handleArgocdToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const p = params as { operation?: string; namespace?: string; name?: string };
  logMcpToolShape("argocd", {
    operation: p.operation,
    namespaceLen: p.namespace?.length,
    nameLen: p.name?.length,
  });
  return runArgocdTool(params);
}

export type CreateAutomationPluginOptions = {
  readonly enableSchedule?: boolean;
  readonly enableNotify?: boolean;
  readonly enableWorkflow?: boolean;
  readonly enableArgoCd?: boolean;
  readonly enableNatsWorker?: boolean;
  readonly enableHitlLabelStudio?: boolean;
};

export function createAutomationPlugin(options: CreateAutomationPluginOptions = {}): Plugin {
  const enableSchedule = options.enableSchedule ?? false;
  const enableNotify = options.enableNotify ?? false;
  const enableWorkflow = options.enableWorkflow ?? false;
  const enableArgoCd = options.enableArgoCd ?? false;
  const enableNatsWorker = options.enableNatsWorker ?? false;
  const enableHitlLabelStudio = options.enableHitlLabelStudio ?? false;
  return {
    id: AUTOMATION_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        if (enableSchedule) {
          yield* api.registerMcpTool({
            name: "schedule",
            schema: scheduleToolSchema,
            handler: (args) => handleScheduleToolInput(args),
          });
          registerScheduleWorkerShutdownHooks();
          startScheduleWorker();
        }
        if (enableNotify) {
          yield* api.registerMcpTool({
            name: "notify",
            schema: notifyToolSchema,
            handler: (args) => handleNotifyToolInput(args as NotifySlackInput),
          });
        }
        if (enableWorkflow) {
          yield* api.registerMcpTool({
            name: "workflow",
            schema: workflowToolSchema,
            handler: (args) => handleWorkflowToolInput(args),
          });
        }
        if (enableArgoCd) {
          yield* api.registerMcpTool({
            name: "argocd",
            schema: argocdToolSchema,
            handler: (args) => handleArgocdToolInput(args),
          });
        }
        if (enableHitlLabelStudio) {
          yield* api.registerMcpTool({
            name: "hitl_enqueue_label_studio",
            schema: hitlLabelStudioToolSchema,
            handler: (args) =>
              handleHitlEnqueueLabelStudioToolInput(args as HitlLabelStudioEnqueueParams),
          });
        }
        if (enableNatsWorker) {
          startNatsWorkflowWorker();
        }
      }),
    onTeardown: () =>
      Effect.sync(() => {
        if (enableSchedule) stopScheduleWorker();
        if (enableNatsWorker) void stopNatsWorkflowWorker();
      }),
  };
}

export { SLACK_NOTIFY_OPERATION_ID };
