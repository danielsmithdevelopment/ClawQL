import { describe, expect, it } from "vitest";
import { createMemoryClient } from "@artifacts-attempts/artifacts-client";
import { forkAttempts } from "./index.js";
import type { Task } from "@artifacts-attempts/shared";

describe("forkAttempts", () => {
  it("creates three forks and write tokens", async () => {
    const client = createMemoryClient();
    await client.create("webhooks-service");
    const task: Task = {
      id: "tsk_7f2a",
      repo: "webhooks-service",
      baseCommit: "abc",
      prompt: "fix retries",
      attempts: 3,
      status: "open",
    };
    const attempts = await forkAttempts(client, task);
    expect(attempts).toHaveLength(3);
    expect(attempts.map((a) => a.fork)).toEqual([
      "tsk_7f2a-att_1",
      "tsk_7f2a-att_2",
      "tsk_7f2a-att_3",
    ]);
    expect(client.tokens.has("tsk_7f2a-att_1:write")).toBe(true);
  });
});
