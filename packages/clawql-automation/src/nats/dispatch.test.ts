import { describe, expect, it, vi } from "vitest";
import { dispatchHitlCompletedEvent } from "./dispatch.js";
import { buildWorkflowEvent } from "./envelope.js";

vi.mock("../workflow/env.js", () => ({
  workflowToolEnabled: () => true,
}));

const { resumeMock } = vi.hoisted(() => ({
  resumeMock: vi.fn(async () => ({
    attempted: true,
    ok: true,
    resumed_nodes: ["hitl-review"],
    workflow_level_resumed: false,
  })),
}));

vi.mock("../workflow/suspend-resume.js", async () => {
  const { Effect } = await import("effect");
  return {
    parseHitlWorkflowRef: (hitl: unknown) => {
      const h = hitl as { workflow?: { namespace: string; name: string } };
      if (h?.workflow?.namespace && h?.workflow?.name) return h.workflow;
      return undefined;
    },
    resumeWorkflowFromHitlRef: resumeMock,
    resumeWorkflowFromHitlRefEffect: (hitl: unknown) =>
      Effect.tryPromise({
        try: () => resumeMock(hitl),
        catch: (cause) => cause,
      }),
  };
});

describe("dispatchHitlCompletedEvent", () => {
  it("resumes workflow when decision=approve and unsigned resume allowed", async () => {
    vi.stubEnv("CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME", "1");
    delete process.env.CLAWQL_NATS_HITL_RESUME_TOKEN;
    resumeMock.mockClear();
    const envelope = buildWorkflowEvent("hitl.completed", "test", {
      workflow_ref: { namespace: "clawql", name: "wf-demo" },
      payload: { decision: "approve" },
    });
    const result = await dispatchHitlCompletedEvent(envelope);
    expect(result.ok).toBe(true);
    expect(resumeMock).toHaveBeenCalled();
  });

  it("refuses resume without decision=approve (audit 5.02)", async () => {
    vi.stubEnv("CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME", "1");
    resumeMock.mockClear();
    const envelope = buildWorkflowEvent("hitl.completed", "test", {
      workflow_ref: { namespace: "clawql", name: "wf-demo" },
    });
    const result = await dispatchHitlCompletedEvent(envelope);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/decision=approve/i);
    expect(resumeMock).not.toHaveBeenCalled();
  });

  it("requires resume token when configured", async () => {
    delete process.env.CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME;
    vi.stubEnv("CLAWQL_NATS_HITL_RESUME_TOKEN", "hitl-secret");
    resumeMock.mockClear();
    const bad = buildWorkflowEvent("hitl.completed", "test", {
      workflow_ref: { namespace: "clawql", name: "wf-demo" },
      payload: { decision: "approve", resume_token: "wrong" },
    });
    expect((await dispatchHitlCompletedEvent(bad)).ok).toBe(false);

    const good = buildWorkflowEvent("hitl.completed", "test", {
      workflow_ref: { namespace: "clawql", name: "wf-demo" },
      payload: { decision: "approve", resume_token: "hitl-secret" },
    });
    expect((await dispatchHitlCompletedEvent(good)).ok).toBe(true);
    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  it("ignores events without workflow ref", async () => {
    vi.stubEnv("CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME", "1");
    const envelope = buildWorkflowEvent("hitl.completed", "test", {
      payload: { decision: "approve" },
    });
    const result = await dispatchHitlCompletedEvent(envelope);
    expect(result.ok).toBe(true);
  });
});
