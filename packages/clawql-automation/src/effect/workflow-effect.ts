/**
 * Native Effect.gen staging for workflow MCP tool:
 * enabled gate → soft Zod parse → K8s / wait dispatch.
 * Wait polls use {@link waitForWorkflowEffect} via the Promise façade inside dispatch.
 * No nested {@link runAutomationEffect}.
 */

import { Effect } from "effect";
import { workflowToolEnabled } from "../workflow/env.js";
import {
  parseWorkflowToolParams,
  runWorkflowParsedOperation,
  workflowDisabledResponse,
} from "../workflow/workflow.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

function softJson(obj: unknown): McpTextResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Workflow tool pipeline as Effect.gen.
 * Parse is sync; K8s / wait IO stays behind {@link automationFromPromise}.
 */
export function executeWorkflowToolCoreEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    if (!workflowToolEnabled()) {
      return workflowDisabledResponse();
    }
    const parsed = parseWorkflowToolParams(params);
    if (!parsed.ok) {
      return softJson({ ok: false, error: parsed.error });
    }
    return yield* automationFromPromise(() => runWorkflowParsedOperation(parsed.value));
  });
}
