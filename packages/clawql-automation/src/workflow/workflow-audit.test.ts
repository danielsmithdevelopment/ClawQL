import { afterEach, describe, expect, it } from "vitest";
import { getDefaultAuditRingBuffer, resetDefaultAuditRingBufferForTests } from "clawql-core";
import { appendWorkflowAudit } from "./workflow-audit.js";

describe("appendWorkflowAudit", () => {
  afterEach(() => {
    resetDefaultAuditRingBufferForTests();
  });

  it("appends workflow category entries to the default audit buffer", () => {
    appendWorkflowAudit({
      action: "submit",
      summary: "namespace=clawql name=clawql-abc phase=Pending",
      correlationId: "run-1",
    });
    const { entries } = getDefaultAuditRingBuffer().list(5);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      category: "workflow",
      action: "submit",
      correlationId: "run-1",
    });
  });
});
