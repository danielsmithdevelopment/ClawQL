import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { decodeAuditInput } from "./audit-input-schema.js";

describe("AuditInputSchema", () => {
  it("trims append fields and defaults list limit", async () => {
    const append = await Effect.runPromise(
      decodeAuditInput({
        operation: "append",
        category: "  tool_call  ",
        action: "  run  ",
        summary: "  ok  ",
      })
    );
    expect(append).toEqual({
      operation: "append",
      category: "tool_call",
      action: "run",
      summary: "ok",
    });
    const listed = await Effect.runPromise(decodeAuditInput({ operation: "list" }));
    expect(listed).toEqual({ operation: "list", limit: 20 });
  });

  it("rejects whitespace-only append category", async () => {
    await expect(
      Effect.runPromise(
        decodeAuditInput({
          operation: "append",
          category: "   ",
          action: "a",
          summary: "s",
        })
      )
    ).rejects.toThrow();
  });
});
