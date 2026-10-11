import { Effect } from "effect";
import { workflowToolEnabled } from "../workflow/env.js";
import {
  parseHitlWorkflowRef,
  resumeWorkflowFromHitlRefEffect,
  type HitlWorkflowRef,
} from "../workflow/suspend-resume.js";
import type { WorkflowEventEnvelope } from "./envelope.js";

export function workflowRefFromEnvelope(
  envelope: WorkflowEventEnvelope
): HitlWorkflowRef | undefined {
  if (envelope.workflow_ref?.namespace && envelope.workflow_ref?.name) {
    return envelope.workflow_ref;
  }
  if (envelope.payload?.clawql_hitl) {
    return parseHitlWorkflowRef(envelope.payload.clawql_hitl);
  }
  return undefined;
}

/** Dispatch `hitl.completed` JetStream events to Argo resume — Effect primary. */
export function dispatchHitlCompletedEventEffect(
  envelope: WorkflowEventEnvelope
): Effect.Effect<{ ok: boolean; error?: string }> {
  return Effect.gen(function* () {
    if (envelope.event_type !== "hitl.completed") {
      return { ok: false, error: `unexpected event_type: ${envelope.event_type}` };
    }
    if (!workflowToolEnabled()) {
      return { ok: false, error: "workflow tool is not enabled" };
    }

    const ref = workflowRefFromEnvelope(envelope);
    if (!ref) {
      return { ok: true };
    }

    const hitlPayload = envelope.payload?.clawql_hitl ?? { workflow: ref };
    const result = yield* resumeWorkflowFromHitlRefEffect(hitlPayload);
    if (!result.attempted) {
      return { ok: true };
    }
    if (result.ok) {
      return { ok: true };
    }
    const err = result.error ?? "resume failed";
    if (/no active suspend/i.test(err) || /already completed/i.test(err)) {
      return { ok: true };
    }
    return { ok: false, error: err };
  });
}

/** Promise façade. */
export async function dispatchHitlCompletedEvent(
  envelope: WorkflowEventEnvelope
): Promise<{ ok: boolean; error?: string }> {
  return Effect.runPromise(dispatchHitlCompletedEventEffect(envelope));
}
