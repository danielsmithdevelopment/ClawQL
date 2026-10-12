/**
 * Durable Object per task: forks attempt repos, mints scoped tokens, holds task state.
 * Day-1: interface + in-memory sketch; Day-2: Artifacts binding + DO storage.
 */

import type { ArtifactsClient } from "@artifacts-attempts/artifacts-client";
import type { Attempt, Task } from "@artifacts-attempts/shared";

export async function forkAttempts(
  client: ArtifactsClient,
  task: Task
): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  for (let i = 1; i <= task.attempts; i++) {
    const id = `att_${i}`;
    const fork = `${task.id}-${id}`;
    await client.fork(task.repo, fork, { description: `Attempt ${id} for ${task.id}` });
    await client.createToken(fork, "write", 3600);
    attempts.push({
      id,
      taskId: task.id,
      fork,
      agent: { client: "pending", model: "pending" },
      status: "working",
    });
  }
  return attempts;
}

export default {
  async fetch(): Promise<Response> {
    return new Response("coordinator — use Durable Object binding from api", { status: 501 });
  },
};
