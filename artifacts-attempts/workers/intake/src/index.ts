/**
 * Artifacts events → normalized push queue messages.
 * Idempotency is enforced in the evaluator by repo+commit.
 */

import type { PushQueueMessage } from "@artifacts-attempts/shared";

export type ArtifactsPushEvent = {
  type: string;
  source: { repoName: string; namespace?: string };
  payload: { after: string; ref?: string };
  metadata?: { eventTimestamp?: string };
};

export function normalizePush(event: ArtifactsPushEvent): PushQueueMessage | null {
  if (event.type !== "cf.artifacts.repo.pushed") return null;
  return {
    type: "push",
    repo: event.source.repoName,
    commit: event.payload.after,
    at: event.metadata?.eventTimestamp ?? new Date().toISOString(),
  };
}

export default {
  async queue(batch: { messages: Array<{ body: ArtifactsPushEvent; ack(): void }> }, env: { EVALUATOR: { create(opts: { params: PushQueueMessage }): Promise<unknown> } }): Promise<void> {
    for (const message of batch.messages) {
      const normalized = normalizePush(message.body);
      if (normalized) {
        await env.EVALUATOR.create({ params: normalized });
      }
      message.ack();
    }
  },
};
