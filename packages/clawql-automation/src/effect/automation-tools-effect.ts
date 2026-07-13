import { Effect } from "effect";
import type { NotifySlackInput } from "../notify/notify.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

export function executeNotifySlackEffect(
  params: NotifySlackInput
): Effect.Effect<McpTextResult, AutomationError> {
  return automationFromPromise(async () => {
    const { executeNotifySlackCore } = await import("../notify/notify.js");
    return executeNotifySlackCore(params);
  });
}

export function executeScheduleToolEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return automationFromPromise(async () => {
    const { executeScheduleToolCore } = await import("../schedule/schedule.js");
    return executeScheduleToolCore(params);
  });
}

export function executeWorkflowToolEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return automationFromPromise(async () => {
    const { executeWorkflowToolCore } = await import("../workflow/workflow.js");
    return executeWorkflowToolCore(params);
  });
}

export function executeArgocdToolEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return automationFromPromise(async () => {
    const { executeArgocdToolCore } = await import("../argocd/argocd.js");
    return executeArgocdToolCore(params);
  });
}
