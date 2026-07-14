/**
 * Native Effect.gen staging for Slack notify:
 * prelude → loadSpec gate → execute → reshape ok:false.
 * No nested {@link runAutomationEffect}.
 */

import { Effect } from "effect";
import {
  ensureNotifySlackOperationPresent,
  evaluateNotifySlackPrelude,
  getNotifyExecuteFn,
  reshapeSlackExecuteResult,
  SLACK_NOTIFY_OPERATION_ID,
  type NotifySlackInput,
} from "../notify/notify.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

function mcpError(error: string): McpTextResult {
  return { content: [{ type: "text", text: JSON.stringify({ error }) }] };
}

/**
 * Notify pipeline as Effect.gen.
 * IO (loadSpec, execute) stays behind {@link automationFromPromise}; soft MCP errors are success values.
 */
export function executeNotifySlackCoreEffect(
  params: NotifySlackInput
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    const prelude = evaluateNotifySlackPrelude(params);
    if (prelude.kind === "result") {
      return prelude.result;
    }

    const missingOp = yield* automationFromPromise(() => ensureNotifySlackOperationPresent());
    if (missingOp) {
      return missingOp;
    }

    const executeFn = getNotifyExecuteFn();
    if (!executeFn) {
      return mcpError(
        "notify execute dependency not configured (call configureNotifyDeps from MCP transport)."
      );
    }

    const exec = yield* automationFromPromise(() =>
      executeFn({
        operationId: SLACK_NOTIFY_OPERATION_ID,
        args: prelude.args,
        fields: prelude.fields,
      })
    );

    return reshapeSlackExecuteResult(exec);
  });
}
