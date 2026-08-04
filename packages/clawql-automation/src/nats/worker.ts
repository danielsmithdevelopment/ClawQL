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
  stopNatsClient,
} from "./client.js";

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

export async function stopNatsWorkflowWorker(): Promise<void> {
  workerStarted = false;
  await stopNatsClient();
}

/** Test hook */
export function resetNatsWorkerForTests(): void {
  workerStarted = false;
}
