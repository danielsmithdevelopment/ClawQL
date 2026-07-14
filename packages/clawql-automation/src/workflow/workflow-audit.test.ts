import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditService,
  AuditTestLayer,
  getDefaultAuditRingBuffer,
  resetDefaultAuditRingBufferForTests,
} from "clawql-core";
import { appendWorkflowAudit, appendWorkflowAuditEffect } from "./workflow-audit.js";

describe("appendWorkflowAudit", () => {
  afterEach(() => {
    resetDefaultAuditRingBufferForTests();
  });

  it("appends workflow category entries via AuditLive (default buffer)", () => {
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

  it("appendWorkflowAuditEffect writes through AuditTestLayer", async () => {
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        yield* appendWorkflowAuditEffect({
          action: "wait",
          summary: "phase=Succeeded",
          correlationId: "run-2",
        });
        const audit = yield* AuditService;
        return yield* audit.list(5);
      }).pipe(Effect.provide(AuditTestLayer))
    );
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0]).toMatchObject({
      category: "workflow",
      action: "wait",
      correlationId: "run-2",
    });
    // Isolated test layer must not touch the process default buffer.
    expect(getDefaultAuditRingBuffer().list(5).entries).toHaveLength(0);
  });
});
