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
};

export function createAutomationPlugin(options: CreateAutomationPluginOptions = {}): Plugin {
  const enableSchedule = options.enableSchedule ?? false;
  const enableNotify = options.enableNotify ?? false;
  const enableWorkflow = options.enableWorkflow ?? false;
  const enableArgoCd = options.enableArgoCd ?? false;
  const enableNatsWorker = options.enableNatsWorker ?? false;
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
