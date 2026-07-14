/**
 * Native Effect.gen staging for argocd MCP tool:
 * enabled gate → parse/dispatch (K8s CRD IO) with soft catch.
 * No nested {@link runAutomationEffect}.
 */

import { Effect } from "effect";
import { argocdToolEnabled } from "../argocd/env.js";
import { argocdDisabledResponse, dispatchArgocdToolCore } from "../argocd/argocd.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

/**
 * Argo CD tool pipeline as Effect.gen.
 * Disabled → soft JSON success; Zod / K8s stay behind {@link automationFromPromise}.
 */
export function executeArgocdToolCoreEffect(
  params: unknown
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    if (!argocdToolEnabled()) {
      return argocdDisabledResponse();
    }
    return yield* automationFromPromise(() => dispatchArgocdToolCore(params));
  });
}
