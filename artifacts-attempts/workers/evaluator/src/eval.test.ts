import { describe, expect, it, beforeEach } from "vitest";
import { checkPolicy, evaluatePush, resetEvalIdempotencyForTests } from "./index.js";
import { verifyEvidenceNote } from "@artifacts-attempts/notes";

describe("evaluator", () => {
  beforeEach(() => resetEvalIdempotencyForTests());

  it("blocks unlisted hosts", () => {
    const p = checkPolicy(["https://evil.example"], ["https://hooks.example.com"]);
    expect(p.clean).toBe(false);
    expect(p.violations[0]).toContain("evil.example");
  });

  it("writes one note per repo+commit", () => {
    const input = {
      type: "push" as const,
      repo: "tsk_7f2a-att_3",
      commit: "c".repeat(40),
      at: "2026-10-11T14:02:11Z",
      taskId: "tsk_7f2a",
      attemptId: "att_3",
      agent: { client: "replay", model: "none" },
      prevHash: null,
    };
    const evidence = {
      tests: { passed: 140, failed: 0, command: "npm test" },
      hostsTouched: ["https://evil.example"],
      allowlist: ["https://hooks.example.com"],
      diff: { insertions: 4, deletions: 0 },
    };
    const a = evaluatePush(input, evidence);
    expect(a.blocked).toBe(true);
    expect(a.duplicate).toBe(false);
    expect(verifyEvidenceNote(a.note).ok).toBe(true);
    const b = evaluatePush(input, evidence);
    expect(b.duplicate).toBe(true);
  });
});
