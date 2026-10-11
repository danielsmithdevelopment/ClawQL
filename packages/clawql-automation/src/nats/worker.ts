import { Effect } from "effect";
import {
  natsConfiguredForConsumer,
  natsConsumerConeshareFollowupEnabled,
  natsConsumerIdpPipelineEnabled,
  natsHitlConsumerConfigured,
} from "./env.js";
import { dispatchHitlCompletedEvent } from "./dispatch.js";
import { dispatchConeshareViewerEvent, dispatchDocumentInboxEvent } from "./dispatch-document.js";
import {
  startConeshareFollowupConsumer,
  startHitlCompletedConsumer,
  startIdpPipelineConsumer,
  stopNatsClientEffect,
} from "./client.js";
import type { AutomationError } from "../effect/automation-errors.js";

let workerStarted = false;

export function startNatsWorkflowWorker(): void {
  if (!natsConfiguredForConsumer() || workerStarted) return;
  workerStarted = true;
  if (natsHitlConsumerConfigured()) {
    void startHitlCompletedConsumer(dispatchHitlCompletedEvent);
  }
  if (natsConsumerIdpPipelineEnabled()) {
    void startIdpPipelineConsumer(dispatchDocumentInboxEvent);
  }
  if (natsConsumerConeshareFollowupEnabled()) {
    void startConeshareFollowupConsumer(dispatchConeshareViewerEvent);
  }
}

export function stopNatsWorkflowWorkerEffect(): Effect.Effect<void, AutomationError> {
  return Effect.gen(function* () {
    workerStarted = false;
    yield* stopNatsClientEffect();
  });
}

/** Promise façade. */
export async function stopNatsWorkflowWorker(): Promise<void> {
  return Effect.runPromise(stopNatsWorkflowWorkerEffect());
}

/** Test hook */
export function resetNatsWorkerForTests(): void {
  workerStarted = false;
}
