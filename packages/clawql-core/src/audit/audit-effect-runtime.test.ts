import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { executeAuditToolEffect, runAuditOperation } from "./audit-effect-runtime.js";
import { AuditTestLayer } from "./audit-service.js";
import { resetDefaultAuditRingBufferForTests } from "./ring-buffer.js";

describe("executeAuditToolEffect / runAuditOperation", () => {
  afterEach(() => {
    resetDefaultAuditRingBufferForTests();
  });

  it("append + list via AuditService Layer", async () => {
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        yield* executeAuditToolEffect({
          operation: "append",
          category: "tool",
          action: "test",
          summary: "hello",
          correlationId: "c1",
        });
        return yield* executeAuditToolEffect({ operation: "list", limit: 10 });
      }).pipe(Effect.provide(AuditTestLayer))
    );
    const body = JSON.parse(listed.content[0]!.text) as {
      ok?: boolean;
      entries?: Array<{ summary?: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.entries?.[0]?.summary).toBe("hello");
  });

  it("runAuditOperation uses AuditLive", async () => {
    const appended = await runAuditOperation({
      operation: "append",
      category: "x",
      action: "y",
      summary: "z",
    });
    const body = JSON.parse(appended.content[0]!.text) as { ok?: boolean; total?: number };
    expect(body.ok).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });
});
