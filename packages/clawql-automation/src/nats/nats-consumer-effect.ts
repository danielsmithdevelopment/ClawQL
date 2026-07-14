/**
 * Effect acquire/release for the NATS HITL resume consumer (plan §7 lifecycle).
 */

import { Effect, type Scope } from "effect";
import {
  startHitlCompletedConsumer,
  stopNatsClient,
  type HitlCompletedConsumerHandler,
} from "./client.js";

/**
 * Start HITL completed consumer; on Scope close → drain/close NATS client.
 * Prefer this from long-lived Effect Scopes; MCP plugin onRegister still uses
 * the Promise façade via {@link startNatsWorkflowWorker}.
 */
export function natsHitlConsumerScopedEffect(
  handler: HitlCompletedConsumerHandler
): Effect.Effect<void, never, Scope> {
  return Effect.acquireRelease(
    Effect.promise(async () => {
      await startHitlCompletedConsumer(handler);
    }),
    () => Effect.promise(() => stopNatsClient())
  );
}
