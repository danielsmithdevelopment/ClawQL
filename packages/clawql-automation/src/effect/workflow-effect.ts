/**
 * Native Effect.gen staging for workflow MCP tool:
 * enabled gate → parse/dispatch (K8s IO) with soft catch.
 * Wait polls use {@link waitForWorkflowEffect} via the Promise façade inside dispatch.
 * No nested {@link runAutomationEffect}.
 */

import { Effect } from "effect";
import { workflowToolEnabled } from "../workflow/env.js";
import { dispatchWorkflowToolCore, workflowDisabledResponse } from "../workflow/workflow.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

/**
 * Workflow tool pipeline as Effect.gen.
 * Disabled → soft JSON success; Zod / K8s stay behind {@link automationFromPromise}.
 */
export function executeWorkflowToolCoreEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    if (!workflowToolEnabled()) {
      return workflowDisabledResponse();
    }
    return yield* automationFromPromise(() => dispatchWorkflowToolCore(params));
  });
}
