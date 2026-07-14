import { Effect } from "effect";
import type { NotifySlackInput } from "../notify/notify.js";
import { AutomationError } from "./automation-errors.js";
import type { McpTextResult } from "./automation-effect-utils.js";
import { executeArgocdToolCoreEffect } from "./argocd-effect.js";
import { executeNotifySlackCoreEffect } from "./notify-slack-effect.js";
import { executeScheduleToolCoreEffect } from "./schedule-effect.js";
import { executeWorkflowToolCoreEffect } from "./workflow-effect.js";

/** Native Effect.gen notify staging (no full-core tryPromise wrapper). */
export function executeNotifySlackEffect(
  params: NotifySlackInput
): Effect.Effect<McpTextResult, AutomationError> {
  return executeNotifySlackCoreEffect(params);
}

/** Native Effect.gen schedule staging. */
export function executeScheduleToolEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return executeScheduleToolCoreEffect(params);
}

/** Native Effect.gen workflow staging. */
export function executeWorkflowToolEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return executeWorkflowToolCoreEffect(params);
}

/** Native Effect.gen Argo CD staging. */
export function executeArgocdToolEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return executeArgocdToolCoreEffect(params);
}
