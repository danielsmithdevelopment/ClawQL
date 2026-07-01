import { natsConfiguredForConsumer } from "./env.js";
import { dispatchHitlCompletedEvent } from "./dispatch.js";
import { startHitlCompletedConsumer, stopNatsClient } from "./client.js";

let workerStarted = false;

export function startNatsWorkflowWorker(): void {
  if (!natsConfiguredForConsumer() || workerStarted) return;
  workerStarted = true;
  void startHitlCompletedConsumer(dispatchHitlCompletedEvent);
}

export async function stopNatsWorkflowWorker(): Promise<void> {
  workerStarted = false;
  await stopNatsClient();
}

/** Test hook */
export function resetNatsWorkerForTests(): void {
  workerStarted = false;
}
