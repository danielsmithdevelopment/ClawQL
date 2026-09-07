import { describe, expect, it } from "vitest";
import { runAuditOperation, runCacheOperation } from "./streams-slim.js";

describe("streams-slim entry", () => {
  it("exports audit append + verify without webmcp", async () => {
    const appended = await runAuditOperation({
      operation: "append",
      category: "streams",
      action: "test",
      summary: "streams-slim unit",
      correlationId: "slim-1",
    });
    const body = JSON.parse(appended.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.hash).toMatch(/^[a-f0-9]{64}$/);

    const verified = await runAuditOperation({ operation: "verify" });
    const v = JSON.parse(verified.content[0]!.text);
    expect(v.ok).toBe(true);
  });

  it("exports cache set/get", async () => {
    const set = await runCacheOperation({
      operation: "set",
      key: "streams:slim:test",
      value: "ok",
    });
    expect(set.ok).toBe(true);
    const get = await runCacheOperation({ operation: "get", key: "streams:slim:test" });
    expect(get.ok).toBe(true);
    if (get.ok && "hit" in get) {
      expect(get.hit).toBe(true);
      expect(get.value).toBe("ok");
    }
  });
});
