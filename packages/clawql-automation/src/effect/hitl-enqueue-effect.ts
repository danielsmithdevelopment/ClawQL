/**
 * Native Effect.gen staging for hitl_enqueue_label_studio:
 * config/validate gate → Label Studio import HTTP → NATS publish hook.
 */

import { Effect } from "effect";
import {
  getHitlLabelStudioRestConfig,
  labelStudioImportTasks,
  mergeHitlMetadata,
  type HitlLabelStudioEnqueueParams,
} from "../hitl/label-studio.js";
import { publishHitlEnqueuedEvent } from "../nats/publish-hooks.js";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise, type McpTextResult } from "./automation-effect-utils.js";

function mcpJson(obj: unknown): McpTextResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/**
 * HITL Label Studio enqueue as Effect.gen.
 * HTTP import + NATS publish stay behind {@link automationFromPromise}.
 */
export function executeHitlEnqueueLabelStudioEffect(
  params: HitlLabelStudioEnqueueParams
): Effect.Effect<McpTextResult, AutomationError> {
  return Effect.gen(function* () {
    const cfg = getHitlLabelStudioRestConfig();
    if (!cfg) {
      return mcpJson({
        error:
          "Label Studio is not configured. Set CLAWQL_LABEL_STUDIO_URL and CLAWQL_LABEL_STUDIO_API_TOKEN.",
      });
    }

    if (!Number.isFinite(params.project_id) || params.project_id < 1) {
      return mcpJson({ error: "`project_id` must be a positive integer." });
    }

    if (!params.tasks?.length) {
      return mcpJson({ error: "`tasks` must be a non-empty array." });
    }

    const payload = mergeHitlMetadata(params);
    const result = yield* automationFromPromise(() =>
      labelStudioImportTasks(cfg.baseUrl, cfg.apiToken, params.project_id, payload)
    );

    if (!result.ok) {
      return mcpJson({
        ok: false,
        error: result.error,
        detail: result.detail,
      });
    }

    const workflowRef = params.workflow_ref
      ? {
          namespace: params.workflow_ref.namespace.trim(),
          name: params.workflow_ref.name.trim(),
          ...(params.workflow_ref.node_field_selector?.trim()
            ? { node_field_selector: params.workflow_ref.node_field_selector.trim() }
            : {}),
        }
      : undefined;

    yield* automationFromPromise(async () => {
      void publishHitlEnqueuedEvent({
        correlation_id: params.correlation_id?.trim(),
        workflow_ref: workflowRef,
        project_id: params.project_id,
        task_count: payload.length,
      });
    });

    return mcpJson({
      ok: true,
      project_id: params.project_id,
      task_count: payload.length,
      label_studio_response: result.body,
    });
  });
}
