import { describe, expect, it } from "vitest";
import { buildCacheSignatureText, hashSystemPrompt } from "./signature.js";

describe("cache signature", () => {
  it("builds stable signature text", () => {
    const text = buildCacheSignatureText([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "hello" },
    ]);
    expect(text).toContain("system:You are helpful");
    expect(text).toContain("user:hello");
  });

  it("hashes system prompt", () => {
    const hash = hashSystemPrompt([{ role: "system", content: "policy v1" }]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
