import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { resolveProgramReturnEffect } from "./program-return.js";

describe("resolveProgramReturnEffect", () => {
  it("projects nested $ref paths into a compact object", async () => {
    const out = await Effect.runPromise(
      resolveProgramReturnEffect(
        {
          ssl: { $ref: "ssl.result.ssl" },
          workers: { $ref: "workers.result.workers" },
          nested: { count: { $ref: "dns.result.aRecordCount" } },
        },
        [
          { id: "ssl", ok: true, value: { ssl: "flexible" } },
          { id: "workers", ok: true, value: { workers: ["edge-router"] } },
          { id: "dns", ok: true, value: { aRecordCount: 12 } },
        ]
      )
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value).toEqual({
        ssl: "flexible",
        workers: ["edge-router"],
        nested: { count: 12 },
      });
    }
  });

  it("resolves whole .result when path is empty", async () => {
    const out = await Effect.runPromise(
      resolveProgramReturnEffect({ card: { $ref: "ssl.result" } }, [
        { id: "ssl", ok: true, value: { ssl: "full" } },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toEqual({ card: { ssl: "full" } });
  });

  it("unwraps MCP text content envelopes", async () => {
    const out = await Effect.runPromise(
      resolveProgramReturnEffect({ ssl: { $ref: "ssl.result.ssl" } }, [
        {
          id: "ssl",
          ok: true,
          value: { content: [{ type: "text", text: JSON.stringify({ ssl: "strict" }) }] },
        },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toEqual({ ssl: "strict" });
  });

  it("merges call objects when return is true", async () => {
    const out = await Effect.runPromise(
      resolveProgramReturnEffect(true, [
        { id: "ssl", ok: true, value: { ssl: "full" } },
        { id: "dns", ok: true, value: { aRecordCount: 3 } },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toEqual({ ssl: "full", aRecordCount: 3 });
  });

  it("fails closed on unknown call id", async () => {
    const out = await Effect.runPromise(
      resolveProgramReturnEffect({ x: { $ref: "missing.result" } }, [
        { id: "ssl", ok: true, value: { ssl: "a" } },
      ])
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/unknown call id/);
  });
});
