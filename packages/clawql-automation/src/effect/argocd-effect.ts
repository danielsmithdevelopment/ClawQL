/**
 * Native Effect.gen staging for argocd MCP tool:
 * enabled gate → soft Zod parse → K8s CRD dispatch (list/get/sync).
 * No nested {@link runAutomationEffect}.
 */

import { Effect } from "effect";
import { argocdToolEnabled } from "../argocd/env.js";
import {
  argocdDisabledResponse,
  parseArgocdToolParams,
  runArgocdParsedOperation,
} from "../argocd/argocd.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

function softJson(obj: unknown): McpTextResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Argo CD tool pipeline as Effect.gen.
 * Parse is sync; K8s IO stays behind {@link automationFromPromise}.
 */
export function executeArgocdToolCoreEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    if (!argocdToolEnabled()) {
      return argocdDisabledResponse();
    }
    const parsed = parseArgocdToolParams(params);
    if (!parsed.ok) {
      return softJson({ ok: false, error: parsed.error });
    }
    return yield* automationFromPromise(() => runArgocdParsedOperation(parsed.value));
  });
}
