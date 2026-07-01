import { describe, expect, it } from "vitest";
import { buildWorkflowEvent, workflowEventSubject } from "./envelope.js";

describe("workflowEventSubject", () => {
  it("uses default workflow root", () => {
    expect(workflowEventSubject("hitl.completed")).toBe("clawql.workflow.hitl.completed");
  });
});

describe("buildWorkflowEvent", () => {
  it("builds a versioned envelope", () => {
    const env = buildWorkflowEvent("hitl.enqueued", "test", {
      correlation_id: "corr-1",
      workflow_ref: { namespace: "clawql", name: "wf-1" },
    });
    expect(env.schema_version).toBe(1);
    expect(env.event_type).toBe("hitl.enqueued");
    expect(env.subject).toBe("clawql.workflow.hitl.enqueued");
    expect(env.correlation_id).toBe("corr-1");
    expect(env.workflow_ref).toEqual({ namespace: "clawql", name: "wf-1" });
    expect(env.source).toBe("test");
    expect(env.ts).toMatch(/^\d{4}-/);
  });
});
