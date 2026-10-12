import { describe, expect, it } from "vitest";
import { claimPaths, dispatchTool, type ToolContext } from "./index.js";
import type { EvidenceNote } from "@artifacts-attempts/notes";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  const note = {
    schema: "artifacts-attempts.evidence/v1",
    taskId: "tsk_demo",
    attemptId: "att_1",
    repo: "tsk_demo-att_1",
    commit: "a".repeat(40),
    evaluatedAt: "2026-10-11T00:00:00.000Z",
    agent: { client: "replay", model: "none" },
    tests: { passed: 3, failed: 0, command: "npm test" },
    policy: { clean: true, violations: [] },
    diff: { insertions: 1, deletions: 0 },
    prev: null,
    hash: "b".repeat(64),
  } as EvidenceNote;
  return {
    task: {
      id: "tsk_demo",
      repo: "webhooks-service",
      baseCommit: "c".repeat(40),
      prompt: "fix retries",
      attempts: 3,
      status: "evaluating",
    },
    attempts: [
      {
        id: "att_1",
        taskId: "tsk_demo",
        fork: "tsk_demo-att_1",
        agent: { client: "replay", model: "none" },
        latestCommit: note.commit,
        status: "evaluated",
      },
      {
        id: "att_2",
        taskId: "tsk_demo",
        fork: "tsk_demo-att_2",
        agent: { client: "replay", model: "none" },
        status: "working",
      },
    ],
    notes: [note],
    selfAttemptId: "att_1",
    claimedPaths: new Map(),
    ...overrides,
  };
}

describe("mcp tools", () => {
  it("task_get returns fork + prompt", () => {
    const r = dispatchTool(ctx(), "task_get");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.data as { fork: string }).fork).toBe("tsk_demo-att_1");
    }
  });

  it("claim_paths detects overlap", () => {
    const c = ctx();
    expect(claimPaths(c, ["src/delivery.js"]).ok).toBe(true);
    const other = ctx({ selfAttemptId: "att_2", claimedPaths: c.claimedPaths });
    const r = claimPaths(other, ["src/delivery.js"]);
    expect(r.ok).toBe(false);
  });

  it("evidence_get by commit", () => {
    const c = ctx();
    const r = dispatchTool(c, "evidence_get", { commit: "a".repeat(40) });
    expect(r.ok).toBe(true);
  });
});
