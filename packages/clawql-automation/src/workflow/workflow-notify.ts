/**
 * Optional Slack notification when a workflow `wait` reaches a terminal phase or times out.
 * Domain path is Effect-primary; Promise façade for wait dispatch edges.
 */

import { Effect } from "effect";
import type { WorkflowSummary } from "./argo-mapper.js";
import { workflowTerminalNotifyEnabled } from "./env.js";
import { automationFromPromise } from "../effect/automation-effect-utils.js";

export function getWorkflowNotifyChannel(): string | undefined {
  const v = process.env.CLAWQL_WORKFLOW_NOTIFY_CHANNEL?.trim();
  return v || undefined;
}

export function maybeNotifyWorkflowTerminalEffect(input: {
  namespace: string;
  name: string;
  workflow: WorkflowSummary;
  timedOut: boolean;
  waitedSeconds: number;
  polls: number;
}): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (!workflowTerminalNotifyEnabled()) return;
    const channel = getWorkflowNotifyChannel();
    if (!channel) return;

    const phase = input.workflow.phase ?? "Unknown";
    const template = input.workflow.template_ref?.name ?? "unknown";
    const correlation = input.workflow.labels?.["clawql.dev/correlation-id"];
    const status = input.timedOut ? "TIMEOUT" : phase.toUpperCase();
    const uiLine = input.workflow.links?.argo_ui ? `\nargo_ui=${input.workflow.links.argo_ui}` : "";

    const text =
      `Workflow ${status}: ${input.namespace}/${input.name}\n` +
      `template=${template}\n` +
      `phase=${phase} timed_out=${input.timedOut} waited_seconds=${input.waitedSeconds} polls=${input.polls}` +
      (correlation ? `\ncorrelation_id=${correlation}` : "") +
      uiLine;

    // Soft-fail: optional side channel must never fail `wait`.
    // Promise edge uses executeNotifySlackCore (not nested runAutomationEffect).
    yield* automationFromPromise(async () => {
      const { executeNotifySlackCore } = await import("../notify/notify.js");
      await executeNotifySlackCore({ channel, text });
    }).pipe(Effect.ignore);
  });
}

/** Promise façade. */
export async function maybeNotifyWorkflowTerminal(input: {
  namespace: string;
  name: string;
  workflow: WorkflowSummary;
  timedOut: boolean;
  waitedSeconds: number;
  polls: number;
}): Promise<void> {
  return Effect.runPromise(maybeNotifyWorkflowTerminalEffect(input));
}
