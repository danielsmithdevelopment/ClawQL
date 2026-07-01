import { describe, expect, it, vi } from "vitest";
import { dispatchHitlCompletedEvent } from "./dispatch.js";
import { buildWorkflowEvent } from "./envelope.js";

vi.mock("../workflow/env.js", () => ({
  workflowToolEnabled: () => true,
}));

vi.mock("../workflow/suspend-resume.js", () => ({
  parseHitlWorkflowRef: (hitl: unknown) => {
    const h = hitl as { workflow?: { namespace: string; name: string } };
    if (h?.workflow?.namespace && h?.workflow?.name) return h.workflow;
    return undefined;
  },
  resumeWorkflowFromHitlRef: vi.fn(async () => ({
    attempted: true,
    ok: true,
    resumed_nodes: ["hitl-review"],
    workflow_level_resumed: false,
  })),
}));

describe("dispatchHitlCompletedEvent", () => {
  it("resumes workflow from envelope workflow_ref", async () => {
    const envelope = buildWorkflowEvent("hitl.completed", "test", {
      workflow_ref: { namespace: "clawql", name: "wf-demo" },
    });
    const result = await dispatchHitlCompletedEvent(envelope);
    expect(result.ok).toBe(true);
  });

  it("ignores events without workflow ref", async () => {
    const envelope = buildWorkflowEvent("hitl.completed", "test", {});
    const result = await dispatchHitlCompletedEvent(envelope);
    expect(result.ok).toBe(true);
  });
});
