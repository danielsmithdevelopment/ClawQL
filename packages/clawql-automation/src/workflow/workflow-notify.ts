/**
 * Optional Slack notification when a workflow `wait` reaches a terminal phase or times out.
 */

import { runNotifySlack } from "../notify/notify.js";
import type { WorkflowSummary } from "./argo-mapper.js";
import { workflowTerminalNotifyEnabled } from "./env.js";

export function getWorkflowNotifyChannel(): string | undefined {
  const v = process.env.CLAWQL_WORKFLOW_NOTIFY_CHANNEL?.trim();
  return v || undefined;
}

export async function maybeNotifyWorkflowTerminal(input: {
  namespace: string;
  name: string;
  workflow: WorkflowSummary;
  timedOut: boolean;
  waitedSeconds: number;
  polls: number;
}): Promise<void> {
  if (!workflowTerminalNotifyEnabled()) return;
  const channel = getWorkflowNotifyChannel();
  if (!channel) return;

  const phase = input.workflow.phase ?? "Unknown";
  const template = input.workflow.template_ref?.name ?? "unknown";
  const correlation = input.workflow.labels?.["clawql.dev/correlation-id"];
  const status = input.timedOut ? "TIMEOUT" : phase.toUpperCase();
  const uiLine = input.workflow.links?.argo_ui
    ? `\nargo_ui=${input.workflow.links.argo_ui}`
    : "";

  const text =
    `Workflow ${status}: ${input.namespace}/${input.name}\n` +
    `template=${template}\n` +
    `phase=${phase} timed_out=${input.timedOut} waited_seconds=${input.waitedSeconds} polls=${input.polls}` +
    (correlation ? `\ncorrelation_id=${correlation}` : "") +
    uiLine;

  try {
    await runNotifySlack({ channel, text });
  } catch {
    // Optional side channel; never fail `wait` because notify failed.
  }
}
